const MAX_BYTES = 8 * 1024 * 1024;

const ACCEPTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file provided"));
      return;
    }
    if (file.size > MAX_BYTES) {
      reject(new Error("Image is larger than 8MB. Please use a smaller file."));
      return;
    }

    const isAcceptableImage = ACCEPTED_MIME.has(file.type);
    const isXml =
      file.type === "application/xml" ||
      file.name?.toLowerCase().endsWith(".drawio") ||
      file.name?.toLowerCase().endsWith(".xml");
    const isPdf = file.type === "application/pdf";

    if (!isAcceptableImage && !isXml && !isPdf) {
      reject(
        new Error(
          "Unsupported file type. Use PNG, JPG, WEBP, GIF, PDF, or draw.io XML."
        )
      );
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      resolve({
        dataUrl: reader.result,
        name: file.name,
        size: file.size,
        type: file.type || (isXml ? "application/xml" : "application/octet-stream"),
      });
    };
    reader.readAsDataURL(file);
  });
}
