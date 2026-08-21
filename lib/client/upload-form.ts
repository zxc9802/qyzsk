import { extractApiErrorMessage, readJsonSafely, redirectToMainAppIfNeeded } from "@/lib/client/api-response";

export function postFormData<T>(options: {
  url: string;
  formData: FormData;
  onProgress?: (percent: number) => void;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", options.url);
    request.responseType = "text";

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || !options.onProgress) return;
      options.onProgress(Math.round((event.loaded / event.total) * 100));
    };

    request.onload = () => {
      const response = new Response(request.responseText, {
        status: request.status,
        headers: {
          "Content-Type": request.getResponseHeader("Content-Type") || "application/json",
        },
      });

      void readJsonSafely<T & { error?: string; message?: string; redirectUrl?: string }>(response).then((payload) => {
        if (redirectToMainAppIfNeeded(response, payload)) {
          reject(new Error("登录已失效，正在返回主站..."));
          return;
        }
        if (!response.ok) {
          reject(new Error(extractApiErrorMessage(payload, "提交失败")));
          return;
        }
        resolve((payload || {}) as T);
      });
    };

    request.onerror = () => reject(new Error("网络异常，提交失败。"));
    request.onabort = () => reject(new Error("提交已取消。"));
    request.send(options.formData);
  });
}
