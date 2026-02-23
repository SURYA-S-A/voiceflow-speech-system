export const getWsUrl = (host: string) => {
    const isSecure = window.location.protocol === "https:";
    return `${isSecure ? "wss" : "ws"}://${host}`;
};

export const getHttpUrl = (host: string) => {
    const isSecure = window.location.protocol === "https:";
    return `${isSecure ? "https" : "http"}://${host}`;
};