export const HTTP_METHODS = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
} as const;

type HttpMethod = keyof typeof HTTP_METHODS;

interface ApiOptions {
  method: HttpMethod;
  body?: unknown;
  headers?: HeadersInit;
}

const apiRequest = async (endpoint: string, options: ApiOptions): Promise<Response> => {
  try {
    console.log(`API Request: ${options.method} ${endpoint}`);

    const response = await fetch(endpoint, {
      method: HTTP_METHODS[options.method],
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error("API request failed:", response.status, response.statusText, errorData);
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response;
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
};

export const apiGet = async (endpoint: string, headers?: HeadersInit): Promise<Response> => {
  return apiRequest(endpoint, { method: HTTP_METHODS.GET, headers });
};

export const apiPost = async (endpoint: string, body?: unknown, headers?: HeadersInit): Promise<Response> => {
  return apiRequest(endpoint, { method: HTTP_METHODS.POST, body, headers });
};

export const apiPut = async (endpoint: string, body?: unknown, headers?: HeadersInit): Promise<Response> => {
  return apiRequest(endpoint, { method: HTTP_METHODS.PUT, body, headers });
};

export const apiDelete = async (endpoint: string, headers?: HeadersInit): Promise<Response> => {
  return apiRequest(endpoint, { method: HTTP_METHODS.DELETE, headers });
};

