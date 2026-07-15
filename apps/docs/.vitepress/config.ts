import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Livery",
  description: "Programmable visual language for agents",
  base: "/livery/",
  cleanUrls: true,
  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/livery/livery-mark.svg" }]],
  themeConfig: {
    logo: "/livery/livery-mark.svg",
    nav: [{ text: "Alpha docs", link: "/alpha/quickstart" }, { text: "Language", link: "/alpha/language" }, { text: "GitHub", link: "https://github.com/jerkeyray/livery" }],
    search: { provider: "local" },
    sidebar: [{
      text: "0.1 alpha",
      items: [
        { text: "Quickstart", link: "/alpha/quickstart" },
        { text: "React chat", link: "/alpha/react-chat" },
        { text: "Agent prompting", link: "/alpha/agent-prompting" },
        { text: "Language", link: "/alpha/language" },
        { text: "Canvas", link: "/alpha/canvas" },
        { text: "Timelines", link: "/alpha/timelines" },
        { text: "Standard library", link: "/alpha/standard-library" },
        { text: "Themes", link: "/alpha/themes" },
        { text: "Exports and CLI", link: "/alpha/exports-cli" },
        { text: "Limits and security", link: "/alpha/limits-security" },
        { text: "Accessibility", link: "/alpha/accessibility" },
        { text: "Migration", link: "/alpha/migration" },
        { text: "Troubleshooting", link: "/alpha/troubleshooting" },
        { text: "Gallery", link: "/alpha/gallery" },
      ],
    }],
    socialLinks: [{ icon: "github", link: "https://github.com/jerkeyray/livery" }],
  },
});
