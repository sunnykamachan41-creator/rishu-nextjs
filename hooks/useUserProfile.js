import useSWR from 'swr'

const fetcher = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) return r.json().then((d) => Promise.reject(d))
    return r.json()
  })

/**
 * ユーザープロフィール（専攻・副免許など）の取得と更新。
 * Google Sheets の user_profiles シートを /api/profile 経由で読み書きする。
 */
export function useUserProfile() {
  const { data, error, isLoading, mutate } = useSWR('/api/profile', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  /**
   * @param {{ specialty?: string, minor?: string, enrollment_year?: number }} updates
   */
  const updateProfile = async (updates) => {
    // 楽観的更新
    mutate((cur) => ({ ...cur, ...updates }), false)

    const res = await fetch('/api/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(updates),
    })

    if (!res.ok) {
      mutate() // revert
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'プロフィールの更新に失敗しました')
    }

    mutate() // revalidate
  }

  return { profile: data, isLoading, error, updateProfile }
}
