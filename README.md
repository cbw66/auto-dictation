# EchoWrite · 自动听写

英语听写网站：导入 PDF / Word / TXT，按页听写，拍照 OCR 批改，自动记录错词。

邀请码：`cbwnb`

## 数据同步说明

账号、词表、听写进度、错词保存在服务端，并通过 GitHub `data` 分支持久化，换设备登录同一账号即可同步。

## 本地开发

```bash
npm install
npm run dev
```

## 一键部署（推荐，可跨设备同步）

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/cbw66/auto-dictation)

部署时把 `GITHUB_TOKEN` 填成有 `repo` 权限的 GitHub Token，用于把数据库同步到本仓库的 `data` 分支。
