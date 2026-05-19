import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * UI設定のグローバルストア（Zustand + localStorage永続化）
 *
 * サーバーデータ（専攻・副免許など）は useUserProfile (SWR) で管理。
 * ここには「表示・UIに関するローカル設定」のみ保存する。
 */
export const useSettingsStore = create(
  persist(
    (set) => ({
      // 表示設定
      darkMode:        false,
      timetableView:   'weekly',  // 'weekly' | 'list'
      showCreditBadge: true,

      // Actions
      toggleDarkMode:     () => set((s) => ({ darkMode: !s.darkMode })),
      setDarkMode:        (v) => set({ darkMode: v }),
      setTimetableView:   (v) => set({ timetableView: v }),
      setShowCreditBadge: (v) => set({ showCreditBadge: v }),
    }),
    { name: 'rishu-ui-settings' }
  )
)
