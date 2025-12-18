import { createRouter, createWebHashHistory } from "vue-router";
import Cookies from 'js-cookie'


import IndexPage from "./pages/IndexPage.vue";
import ClipPage from "./pages/ClipPage.vue";
import FilePage from "./pages/FilePage.vue";
import LoginPage from "./pages/LoginPage.vue";
import FileManagePage from "./pages/FileManagePage.vue";

const routes = [
    {
        path: "/",
        name: "index",
        meta: {
            title: "首页",
        },
        component: IndexPage,
    },
    {
        path: "/clip",
        name: "clip",
        meta: {
            title: "剪贴板",
        },
        component: ClipPage,
    },
    {
        path: "/file",
        name: "file",
        meta: {
            title: "文件上传",
        },
        component: FilePage,
    },
    {
        path: "/filemanage",
        name: "filemanage",
        meta: {
            title: "文件管理",
        },
        component: FileManagePage,
    },
    {
        path: "/login",
        name: "login",
        meta: {
            title: "登录",
        },
        component: LoginPage,
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

router.beforeEach((to, from, next) => {
    if (to.meta.title) {
        document.title = to.meta.title as string;
    }
    const PASSWORD = Cookies.get('PASSWORD');
    if (!PASSWORD && to.path !== '/login') {
        next({
            path: '/login',
        })
    } else {
        next()
    }
})

export default router;
export { routes };