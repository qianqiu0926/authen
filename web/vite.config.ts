import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/authen/',plugins:[react()],server:{host:'127.0.0.1',proxy:{'/authen/api':{target:'http://127.0.0.1:4173',rewrite:p=>p.replace(/^\/authen/,'')},'/api':'http://127.0.0.1:4173'}}});
