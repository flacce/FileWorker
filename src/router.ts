import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

function hasAuth(): boolean {
  return document.cookie.includes('__auth=')
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'studio',
    meta: { title: '文件云工作台' },
    component: () => import('./pages/StudioPage.vue'),
  },
  {
    path: '/file',
    name: 'file',
    meta: { title: '文件中心' },
    component: () => import('./pages/StudioPage.vue'),
  },
  {
    path: '/clip',
    name: 'clip',
    meta: { title: '在线剪贴板' },
    component: () => import('./pages/StudioPage.vue'),
  },
  {
    path: '/login',
    name: 'login',
    meta: { title: '安全登录' },
    component: () => import('./pages/LoginPage.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  if (typeof to.meta.title === 'string') {
    document.title = to.meta.title
  }
  const authed = hasAuth()
  if (!authed && to.path !== '/login') {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
