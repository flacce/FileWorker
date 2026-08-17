import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Visibility } from '@/types'

export const useClipStore = defineStore(
  'clip',
  () => {
    const visibility = ref<Visibility>('public')

    function setVisibility(value: Visibility) {
      visibility.value = value
    }

    return { visibility, setVisibility }
  },
  { persist: true },
)

export default useClipStore
