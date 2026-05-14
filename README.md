# homepage_with_pretext

这是一个基于 Vite、TypeScript 和 `@chenglou/pretext` 的交互式个人主页项目。

## 在线访问

[https://jsnjfz.github.io/index](https://jsnjfz.github.io/index)

## 页面预览

![主页预览动图](homepage-preview.gif)

## 目录结构

- `homepage/`：前端主页源码与构建配置。
- `homepage/src/`：交互动画和样式源码。
- `homepage/public/`：静态资源。
- `homepage/index/`：历史发布产物目录，仅作为旧发布快照保留。
- `preview-video/`：README 预览动画的 HyperFrames 源文件与渲染脚本。

## 本地运行

```powershell
cd homepage
bun install
bun run dev
```

## 构建

```powershell
cd homepage
bun run build
```

构建产物输出到 `homepage/dist/`。
