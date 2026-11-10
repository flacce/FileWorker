import { ref } from 'vue'
import type { NoticeEntry, NoticeTone } from '@/types'

const queue = ref<NoticeEntry[]>([])
let seq = 1

export function notify(text: string, tone: NoticeTone = 'normal', ms = 2400) {
  const id = seq++
  queue.value.push({ id, text, tone })
  if (queue.value.length > 4) {
    queue.value.shift()
  }
  if (ms > 0) {
    window.setTimeout(() => {
      dismissNotice(id)
    }, ms)
  }
}

export function dismissNotice(id: number) {
  const idx = queue.value.findIndex((item) => item.id === id)
  if (idx !== -1) {
    queue.value.splice(idx, 1)
  }
}

export function useNoticeStore() {
  return {
    queue,
    notify,
    dismissNotice
  }
}
