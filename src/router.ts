import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

export function hasClientAuthCookie(): boolean {
  return document.cookie.split(';').some((part) => part.trim().startsWith('__auth='))
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    meta: { title: '云端文件匣 · 文件仓库' },
    component: () => import('./views/BentoWorkspaceView.vue')
  },
  {
    path: '/file',
    name: 'file',
    meta: { title: '云端文件匣 · 文件仓库' },
    component: () => import('./views/BentoWorkspaceView.vue')
  },
  {
    path: '/clip',
    name: 'clip',
    meta: { title: '云端文件匣 · 云剪贴板' },
    component: () => import('./views/BentoWorkspaceView.vue')
  },
  {
    path: '/login',
    name: 'login',
    meta: { title: '云端文件匣 · 门禁验证' },
    component: () => import('./views/AuthGateView.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to) => {
  if (typeof to.meta.title === 'string') {
    document.title = to.meta.title
  }
  if (to.path !== '/login' && !hasClientAuthCookie()) {
    return {
      path: '/login',
      query: { redirect: to.fullPath }
    }
  }
  return true
})

export default router
