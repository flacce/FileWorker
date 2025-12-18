import axios, { AxiosError } from 'axios';
import router from '@/router';
import { toast } from '@/utils/toast';

const initInterceptors = () => {
    axios.interceptors.response.use(
        async (response) => {
            return response;
        },
        async (error: AxiosError) => {
            toast("请求出错", "error");
            if (error.response?.status === 401) {
                await router.push('/login');
            }
            return Promise.reject(error);
        });
}

export { initInterceptors };