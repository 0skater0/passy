import {defineConfig, loadEnv} from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({mode}) => {
    const env = loadEnv(mode, process.cwd(), '');
    const basePath = env.VITE_BASE_PATH && env.VITE_BASE_PATH.trim() !== '' ? env.VITE_BASE_PATH : '/';
    const version = (env.APP_VERSION && env.APP_VERSION.trim() !== '' ? env.APP_VERSION : '')
        || (env.VITE_APP_VERSION && env.VITE_APP_VERSION.trim() !== '' ? env.VITE_APP_VERSION : '')
        || (process.env.npm_package_version || '');
    return {
        base: basePath,
        plugins: [vue(), tailwindcss()],
        publicDir: path.resolve(__dirname, 'src/assets/public'),
        server: {
            port: 5173
        },
        build: {
            sourcemap: false
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src')
            }
        },
        define: {
            __APP_BUILD_INFO__: JSON.stringify({
                basePath,
                mode,
                version,
            })
        }
    };
});


