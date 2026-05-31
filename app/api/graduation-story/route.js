import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchAllSheets, fetchRecognizedCoursesForStudent } from '@/lib/sheets'
import { normalizeCourse } from '@/lib/transform'
import { getRandomMessage } from '@/lib/graduationMessages'

export const dynamic = 'force-dynamic'

// /api/data と同じ年度展開ロジック
function expandCoursesByYear(courses) {
  const result = []
  for (const c of courses) {
    const { start_year, end_year } = c
    if (
      start_year != null && end_year != null &&
      Number.isFinite(start_year) && Number.isFinite(end_year) &&
      start_year <= end_year
    ) {
      for (let y = start_year; y <= end_year; y++) {
        result.push({ ...c, academic_year: y })
      }
    } else {
      result.push(c)
    }
  }
  return result
}

export async function GET() {
  try {
    // ── 認証 ─────────────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = session.user.student_id

    // ── シート取得 ───────────────────────────────────────────────────────────
    const [
      {
        courses: rawCourses,
        normalizedEnrollment,
        userCurriculumYear,
        userDepartment,
        departmentRows,
      },
      recognizedCourses,
    ] = await Promise.all([
      fetchAllSheets(studentId),
      fetchRecognizedCoursesForStudent(studentId),
    ])

    // 単位認定された course_id の集合（出席ベース統計から除外するため）
    const recognizedCourseIds = new Set(
      (recognizedCourses ?? []).map(r => r.course_id).filter(Boolean)
    )

    const courses = expandCoursesByYear(rawCourses.map(normalizeCourse))

    // course を class_id + academic_year でJOINできるようMapにする
    const courseMap = new Map()
    for (const c of courses) {
      courseMap.set(`${c.class_id}|${c.academic_year}`, c)
    }

    // ── 対象 enrollment を絞る（仮登録は除外）────────────────────────────────
    const allEnrollments = normalizedEnrollment.filter(e => !e.is_temporary)

    // 「通った」事実ベース：FAILED含む全enrollment（一般統計用）
    const allReal = allEnrollments

    // 「取得」系：COMPLETEDのみ
    const completed = allEnrollments.filter(e => e.status === 'COMPLETED')

    // ── enrollment × course JOIN ──────────────────────────────────────────────
    function joinCourse(e) {
      return courseMap.get(`${e.class_id}|${e.academic_year}`) ?? null
    }

    const allRealWithCourse   = allReal.map(e => ({ e, c: joinCourse(e) })).filter(x => x.c)
    const completedWithCourse = completed.map(e => ({ e, c: joinCourse(e) })).filter(x => x.c)

    // 出席ベース統計用：単位認定科目を除外（ヒートマップ・教室・学年・学期・運命の人）
    const isRecognized = (e) => recognizedCourseIds.has(e.course_id)
    const attendedWithCourse   = allRealWithCourse.filter(({ e }) => !isRecognized(e))
    const completedAttendedWithCourse = completedWithCourse.filter(({ e }) => !isRecognized(e))

    // ── ユーザー情報 ─────────────────────────────────────────────────────────
    const curriculumYear = userCurriculumYear ?? null

    const departments = (departmentRows ?? []).map(r => ({
      department_id: r.department_id?.toString().trim(),
      label: (r.label || '').trim(),
    }))
    const deptLabel = departments.find(d => d.department_id === userDepartment)?.label ?? userDepartment ?? ''

    const latestAcademicYear = courses.reduce((max, c) => Math.max(max, c.academic_year ?? 0), 0)
    const yearRange = curriculumYear
      ? `${curriculumYear}.4 — ${curriculumYear + 4}.3`
      : ''

    // ── スライド② 総履修授業数 / 総取得単位数 ─────────────────────────────
    const totalCourses  = allReal.length
    const totalCredits  = completedWithCourse.reduce((sum, { c }) => sum + (c.credits ?? 0), 0)

    // ── スライド③ 単位取得率（授業数ベース）─────────────────────────────────
    const enrolledCount = allReal.length   // 分母：FAILED含む全部
    const passedCount   = completed.length // 分子：COMPLETEDのみ
    const passRate      = enrolledCount > 0 ? Math.round((passedCount / enrolledCount) * 100) : 0

    // ── スライド④ ヒートマップ ────────────────────────────────────────────────
    // day_time 形式: "月1" "火3" など。normalized_time も参照
    const DAY_MAP  = { '月': 0, '火': 1, '水': 2, '木': 3, '金': 4 }
    // 英語略称 → 日本語曜日
    const EN_DAY = { MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金' }
    const heatmap  = {} // "月_1" → count

    for (const { c } of attendedWithCourse) {  // 単位認定除外
      const raw = (c.normalized_time || c.day_time || '').trim()
      if (!raw) continue

      // MON_3, TUE_2, WED_1 … 形式（複数コマは空白区切り: "MON_3 WED_1"）
      const tokens = raw.toUpperCase().split(/\s+/)
      for (const token of tokens) {
        let day = '', periodNum = 0

        // ① 英語略称形式: MON_3
        const enM = token.match(/^(MON|TUE|WED|THU|FRI)_(\d)$/)
        if (enM) {
          day       = EN_DAY[enM[1]] ?? ''
          periodNum = parseInt(enM[2])
        } else {
          // ② 日本語形式: 月3 / 月曜3限 etc.
          const jaM = token.match(/([月火水木金])[曜日]*(\d)/)
          if (jaM) {
            day       = jaM[1]
            periodNum = parseInt(jaM[2])
          }
        }

        if (!day || !(day in DAY_MAP)) continue
        if (periodNum < 1 || periodNum > 5) continue
        if (day === '水' && periodNum > 3) continue
        const key = `${day}_${periodNum}`
        heatmap[key] = (heatmap[key] ?? 0) + 1
      }
    }

    // 最多コマを特定
    let mostFrequent = null
    let mostCount    = 0
    for (const [key, count] of Object.entries(heatmap)) {
      if (count > mostCount) {
        mostCount    = count
        mostFrequent = key // "火_3"
      }
    }
    const [mostDay, mostPeriod] = mostFrequent ? mostFrequent.split('_') : ['', '']

    // ── スライド⑤ 最も多く通った教室 ────────────────────────────────────────
    const classroomCount = {}
    for (const { c } of attendedWithCourse) {  // 単位認定除外
      const room = (c.room || c.class || '').trim()
      if (!room) continue
      // session_count があればその回数、なければ1として集計
      const sessions = c.session_count ?? 1
      classroomCount[room] = (classroomCount[room] ?? 0) + sessions
    }

    const topClassroom = Object.entries(classroomCount).sort((a, b) => b[1] - a[1])[0] ?? null
    const topClassroomName    = topClassroom?.[0] ?? ''
    const topClassroomCount   = topClassroom?.[1] ?? 0
    const topClassroomMinutes = topClassroomCount * 100

    // 棟名を抽出（先頭の英字部分）
    const topClassroomBuilding = topClassroomName.match(/^([A-Za-zА-Яа-я一-龥ぁ-んァ-ン]+)/)?.[1] ?? ''

    // ── スライド⑥ 学年別授業数（授業数ベース・単位認定除外）────────────────
    const coursesByGrade = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const { e } of completedAttendedWithCourse) {  // 単位認定除外
      const grade = e.year
      if (grade >= 1 && grade <= 4) {
        coursesByGrade[grade] = (coursesByGrade[grade] ?? 0) + 1
      }
    }
    const busiestGrade = parseInt(
      Object.entries(coursesByGrade).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '3'
    )

    // ── スライド⑦ 学期タイプ（授業数ベース・単位認定除外・通年除外）──────────
    let springCourses = 0
    let autumnCourses = 0
    for (const { e, c } of completedAttendedWithCourse) {  // 単位認定除外
      // 通年（FULL_YEAR）は春秋どちらにも計上しない
      if (c.term_code === 'FULL_YEAR') continue
      const sem = e.semester
      if (sem === 'spring') springCourses++
      else if (sem === 'fall') autumnCourses++
    }
    const semesterType = springCourses >= autumnCourses ? 'spring' : 'autumn'

    // ── スライド⑧ 運命の人（実際に出席した授業からランダム選択・単位認定除外）
    const instructors = attendedWithCourse
      .map(({ c }) => (c.intructor || '').trim())
      .filter(Boolean)

    let fatedInstructor = ''
    let fatedCourseCount = 0
    if (instructors.length > 0) {
      // ランダムに1件選んで、その教員の担当授業数をカウント
      const randomInstructor = instructors[Math.floor(Math.random() * instructors.length)]
      fatedInstructor  = randomInstructor
      fatedCourseCount = allRealWithCourse.filter(({ c }) =>
        (c.intructor || '').trim() === fatedInstructor
      ).length
    }

    const fatedMessage = getRandomMessage()

    // ── レスポンス ──────────────────────────────────────────────────────────
    return NextResponse.json({
      // ユーザー情報
      studentId,
      userName:        session.user.name ?? '',
      department:      deptLabel,
      curriculumYear,
      yearRange,
      latestAcademicYear,

      // スライド②
      totalCourses,
      totalCredits,

      // スライド③
      passRate,
      enrolledCount,
      passedCount,

      // スライド④
      heatmap,
      mostDay,
      mostPeriod: mostPeriod ? parseInt(mostPeriod) : null,

      // スライド⑤
      topClassroom:         topClassroomName,
      topClassroomBuilding,
      topClassroomCount,
      topClassroomMinutes,

      // スライド⑥（授業数ベース）
      coursesByGrade,
      busiestGrade,
      busiestGradeCount: coursesByGrade[busiestGrade] ?? 0,

      // スライド⑦（授業数ベース）
      springCourses,
      autumnCourses,
      semesterType,

      // スライド⑧
      fatedInstructor,
      fatedCourseCount,
      fatedMessage,
    })
  } catch (err) {
    console.error('[GET /api/graduation-story]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
