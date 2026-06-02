import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "幸福人生",
    short_name: "幸福人生",
    description: "AI 身心健康陪伴系统",
    start_url: "/",
    display: "standalone",
    background_color: "#08123c",
    theme_color: "#182b77",
  };
}
