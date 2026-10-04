# 列表紧凑化与电流表报告入口验收

日期：2026-10-04。final result: passed

本轮范围：压缩教材实验卡片；电流表实验报告移除“完成实验”，将原“查看测量报告”改为“查看实验数据”，直接打开实验内的“实验结果数据”；隐藏电流表会话旧报告入口，有效旧地址返回实验台。其他物理实验旧报告保持。保存的会话、读数和操作记录不删除。

source visual truth：用户提供的 codex-clipboard-e0ed9877-7498-4665-b0b5-c281892989fe.png、codex-clipboard-5f57159f-407e-48bc-abce-37717c465ff9.png、codex-clipboard-c4d9cabb-a881-44d6-8de2-b835f8a0da37.png，均位于本次用户附件临时目录。以前的缩略图验收保留在 docs/compact-report-qa/previous-design-qa.md。

## 视觉检查

证据：docs/compact-report-qa/desktop.png、card.png、mobile.png、report.png、data.png。

桌面视口 1155×892 CSS px，原生截图 1147×886px；窄屏临时视口 390×844 CSS px，截图 382×827px，已恢复默认视口。用户参考是局部标注画面，本轮按位置、间距和交互验收，不宣称逐像素复刻。源图、完整实现截图与局部卡片均已打开核验。

- 删除副标题固定两行高度，缩小主标题上间距、副标题上下间距和底部分隔线上内边距。桌面电流表卡片高度从 427.34375px 降至 389.34375px，副标题高度 22px，副标题底部到 footer 顶部 12px。
- 窄屏卡片 350×354.75px，副标题高度 22px、footer 间距 12px，文档宽 382px，小于 390px 视口，无横向溢出。
- 字体、白卡、蓝色标题/入口、必做标识和真实缩略图保留；章节、主视觉、主副标题、底部信息顺序正确。
- 报告底部只有“查看实验数据”，没有“完成实验”和“查看测量报告”。点击后报告收起，实验结果数据面板出现，工具栏选中状态同步，URL 保持实验页。
- 实际历史电流表旧报告地址已验证重定向到 /physics/labs/ammeter-use。

## 验证与审查

- 全量 pnpm test：63 文件、801 项通过。
- pnpm run build：通过，11.54 秒。
- 新回归覆盖报告/数据互斥切换、工具栏状态、会话不被完成、旧地址重定向、旧入口隐藏和已存事件保留。
- 独立只读审查无有证据支持的 P1/P2；审查者独立运行报告流程与 Stage 测试，14/14 通过。
- git diff --check：通过。
- 定点 ESLint 没有新增问题；仍报告原有 PhysicsReportPage.tsx 两个辅助函数导出的 Fast Refresh 错误，以及 PhysicsLabShell.tsx 原有 effect 的 runtime 依赖警告。已与 HEAD 源码核对，未为本轮需求重构这些代码，不将 lint 声称为全部通过。

## Implementation Checklist

- 卡片空白缩减、桌面和窄屏布局已核验。
- 电流表旧报告界面与入口已退出当前使用路径，历史记录保留。
- 报告 footer 直接打开实验内数据，未完成会话或打开旧确认弹窗。
- 无待修复 P0/P1/P2。未提交 Git 或发布。

final result: passed
