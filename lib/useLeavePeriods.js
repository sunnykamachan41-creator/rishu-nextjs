'use client'

/**
 * useLeavePeriods
 * ─────────────────────────────────────────────────────────────────────────────
 * 休学期間状態を管理する共通 SWR フック。
 *
 * モーダル・時間割ロック・displayGrade 補正の全コンシューマーが
 * このフック経由で同じ SWR キャッシュを参照する。
 *
 * - SWR キー: '/api/leave-periods'
 * - ログイン前（studentId なし）は fetch しない
 * - 保存・削除後は mutateLeavePeriods() を呼ぶだけでグローバルに反映される
 */

import useSWR from 'swr'
import { useSession } from 'next-auth/react'

const SWR_KEY = '/api/leave-periods'

const fetcher = url => fetch(url).then(r => {
  if (!r.ok) return r.json().then(d => Promise.reject(d))
  return r.json()
})

/**
 * @returns {{
 *   leaveSemesters:        import('@/lib/leavePeriods').GradeSemester[],
 *   rawLeavePeriods:       { leave_start: string, leave_end: string }[],
 *   mutateLeavePeriods:    () => void,
 *   isLoadingLeavePeriods: boolean,
 * }}
 */
export function useLeavePeriods() {
  const { data: session } = useSession()
  const enabled = !!session?.user?.student_id

  const { data, mutate, isLoading } = useSWR(
    enabled ? SWR_KEY : null,
    fetcher,
    {
      refreshInterval:   30_000,
      revalidateOnFocus: true,
      dedupingInterval:  5_000,
    },
  )

  return {
    leaveSemesters:        data?.leaveSemesters  ?? [],
    rawLeavePeriods:       data?.rawLeavePeriods ?? [],
    mutateLeavePeriods:    mutate,
    isLoadingLeavePeriods: isLoading,
  }
}
