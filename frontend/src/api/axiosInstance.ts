import axios from 'axios';
import { toast } from 'sonner';

export const axiosInstance = axios.create({
  baseURL: import.meta.env?.VITE_API_URL || '/api',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isCancel(error)) {
      const data = axios.isAxiosError(error) ? error.response?.data : undefined;
      const message = data?.message;
      const description = Array.isArray(message) ? message.join('; ') : message;

      toast.error('API request failed', {
        id: 'api-error',
        description: typeof description === 'string' ? description : 'Check the backend connection and try again.',
      });
    }

    return Promise.reject(error);
  },
);