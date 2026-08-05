# EchoWrite · 自动听写

英语听写网站：导入 PDF / Word / TXT，按页听写，拍照 OCR 批改，自动记录错词。

## 功能

- 邀请码注册（邀请码：`cbwnb`）与登录
- 导入 PDF、Word、TXT，按页提取英语单词
- 听写模式：页面不显示单词；`←` / `→` / `Space` 控制上一个、下一个、重读
- 听写后拍照或上传图片，OCR 自动批改并写入错词本
- 个人主页：全部错词 + 各文件听写进度

## 启动

```bash
npm install
npm run dev
```

- 前端：http://localhost:5173
- API：http://localhost:8787

生产构建：

```bash
npm run build
npm start
```

## 使用提示

1. 注册时填写邀请码 `cbwnb`
2. 首页导入词表文件，进入文件后选择页码开始听写
3. 听写时请用键盘方向键与空格（小键盘方向键同样可用）
4. 完成后进入「拍照批改」，错词会出现在「个人主页」
