# 好运钱庄 Demo

面向全民K歌用户的轻量翻牌收集游戏交互 Demo。

## 在线体验

- GitHub Pages：<https://wuyuying003.github.io/>
- Sites 预览：<https://haoyun-bank-card-game.zhanghong1357.chatgpt.site>

## 已实现

- 12 张卡牌，4×3 布局
- 模拟激励广告和广告失败
- 每次有效翻牌获得 50 金币
- 玉如意、金元宝、方孔金币三类结果
- 三档 4 格收集进度
- 集齐 4 个自动结算
- 领奖动画、再来一局、规则说明
- 测试控制面板

## 本地运行

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。

## 交付说明

当前仓库可作为玩法逻辑和交互状态参考。正式开发以 PRD 和 Figma 为视觉标准；广告与奖励均为模拟逻辑，需要由研发接入实际激励广告 SDK 和领奖接口。
