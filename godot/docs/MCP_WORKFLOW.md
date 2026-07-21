# Godot MCP Workflow

本文档定义 AI Agent 如何在本项目中使用 Godot MCP。MCP 是工具层，不是 Product Scope；任何 MCP 操作都必须服从 `HARNESS.md`、`DECISIONS.md` 和当前 Active Version。

## 目标

Godot MCP 用来建立更短的 inspect、edit、run、debug feedback loop：

- inspect：读取 Project、SceneTree、Node、Signal、Resource 和 Debug Output。
- edit：通过 Godot-aware API 创建或修改 Scene、Resource、Signal 和 Project Setting。
- run：启动 Editor、运行 Project 或 Scene，收集 Error。
- evaluate：截图、检查 Runtime SceneTree，并验证 Player-visible Flow。

MCP 不替代 Version Document、Eval 或 Godot CLI。MCP 不可用时，必须能降级到 Godot CLI、文件检查和 Manual Eval。

## Tooling Choice

当前推荐默认工具：

- MCP Server：`@coding-solo/godot-mcp`。
- Godot Executable：`/Users/anthonyyao/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot`。
- Godot Version：`4.7.1.stable.steam.a13da4feb`。

未来可评估 Godot Agent Tools、hi-godot/godot-ai 或其他 MCP，但必须先记录 Decision，并说明迁移原因、权限面和项目写入方式。

## 使用顺序

实现或修改 Godot Feature 时，Agent 应按以下顺序工作：

1. 读取 `HARNESS.md`、最近的 `AGENTS.md` 和 Active Version。
2. 读取本文件，确认 MCP 是否适用于当前任务。
3. 使用 MCP 或 CLI inspect 当前 Project 和目标 Scene。
4. 制定最小变更，只覆盖 Active Version 的 Implementation Boundary。
5. 优先通过 Godot-aware 操作修改 `.tscn`、`.tres`、Signal、Project Setting 和 UID-sensitive Resource。
6. 运行 Headless Load 或 Project Run。
7. 读取 Debug Output；如有 Error，先复现和定位，再继续修改。
8. 执行 Active Version 的 Required Eval，并记录 Evidence。

## 写入规则

以下文件类型优先通过 Godot Editor、Godot CLI、MCP 或 Godot API 写入：

- `.tscn`
- `.tres`
- `.res`
- `project.godot`
- Animation、Theme、Signal、UID、Imported Resource 相关文件

原因：这些文件包含 Godot-specific invariants，例如 UID、sub-resource ID、inherited-scene override、Signal connection 和 Import metadata。直接手写文本容易产生 Editor 能打开但运行时坏掉的状态。

允许直接用普通文本方式编辑：

- `.gd` script，但必须保持 Godot 4.7 语法、static typing 和 parse-clean。
- `.md` documentation。
- `.json`、`.yaml`、`.csv` 等 Content Definition，但必须通过对应 Validator 或 Load Check。

## 标准 Feedback Loop

每次 MCP-assisted implementation 至少形成一轮：

```text
inspect project/scene
-> apply smallest edit
-> run headless or run project
-> collect debug output
-> inspect runtime state or screenshot
-> compare with Version Acceptance
```

如果一个 Scene 改动没有经过 run 或 load check，不得声称完成。

## 当前 v0.1.0 用法

`v0.1.0 Initial Screen` 适合使用 MCP 完成以下验证：

- Project Main Scene 是否正确设置。
- Initial Screen SceneTree 是否只有本 Version 需要的 UI。
- `home.png` 是否作为 Background 显示并覆盖 Viewport。
- Title `一起做任务吧！`、四个 Button 和 Placeholder Panel 是否可见。
- Theme color 和 spacing 是否来自 `godot/ui/style/style.gd` 的 `GameStyle` token。
- Title、Button、Modal 和 spacing constants 是否来自 `GameStyle` token。
- Title 是否呈现原创的手写木牌/和纸标题方向，且没有外部字体或 Logo Asset。
- Button 是否呈现原创的柔和纸质菜单牌方向，且没有外部 UI Kit Texture。
- 四个 Button 是否 group 到同一个 `VBoxContainer`。
- `VBoxContainer.theme_override_constants/separation` 是否来自 `GameStyle.BUTTON_SEPARATION`。
- Menu Button Group 和外层 Layout 是否使用 Fill/Expand size flags 自适应。
- Button Signal 是否连接到 Presentation Script。
- `设置`、`继续游戏`、`新建游戏` 的 Panel 是否可打开并返回。
- `退出游戏` 是否触发 quit request。
- Debug Output 是否无 Error。
- Screenshot 是否能证明 `1280x720` 和 `960x540` 下无重叠。

本 Version 不允许通过 MCP 顺手添加 Gameplay Scene、Save Slot、Login UI、Audio Setting、Key Remapping 或 Backend Adapter。

## 降级路径

MCP 不可用时，执行以下降级：

1. 用 Godot CLI 运行：

```bash
GODOT_EXECUTABLE="/Users/anthonyyao/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot"
"$GODOT_EXECUTABLE" --headless --path godot --editor --quit
"$GODOT_EXECUTABLE" --headless --path godot --quit-after 3
```

2. 用 Godot Editor Manual Run 检查 UI Flow。
3. 在 Required Eval 中记录 MCP 不可用原因、CLI Output 和 Manual Evidence。

## 安全和权限

- MCP 只用于本地 Godot Project。
- 不通过 MCP 修改 `Frontend/`。
- 不通过 MCP 保存 Secret、API Key、Payment Credential 或 LLM Credential。
- 不开启非本机暴露的 Server，除非另有 Accepted Decision。
- 不把 MCP Debug Output 当作 Production Telemetry。

## 参考项目

- `Coding-Solo/godot-mcp`：Godot launch、run、debug output 和 scene management。
- `alexmeckes/godot-claude-skills`：Godot skill pack，强调 MCP + inspect/edit/run/debug workflow。
- `GodotAgentTools`：强调通过 Godot API 修改 scene/resource，降低手写 `.tscn` 和 `.tres` 的风险。
