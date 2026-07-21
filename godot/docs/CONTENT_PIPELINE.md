# Content 和 Asset Pipeline

游戏依赖大量 Content。Pipeline 必须允许 Designer 和 Agent 在不编辑 Generic Gameplay Logic 的情况下添加 Content。

## Content Workflow

每次新增 Item、Recipe、Furniture、Pet、Event、Region、Weather Type、Action 或 Audio Rule 时：

1. 确认 Concept 已存在于 `CONTEXT.md`，否则先添加。
2. 添加或更新经过 Validation 的 Definition。
3. 添加 Localization Key 和 Fallback Text。
4. 添加引用的 Visual/Audio Asset，或经过批准的 Placeholder。
5. 添加 Focused Definition Validation。
6. 添加 Test 或 Eval，证明该 Content 可到达并且 Behavior 正确。
7. 如果 Stable ID 或 Runtime State 受影响，检查 Save Compatibility。

## Definition Validation

Validator 至少应捕获：

- Duplicate 或 Malformed ID。
- Missing Localization Key。
- Missing Resource Path。
- 引用 Unknown Item、Recipe、Furniture、Pet、Event、Region、Weather、Dialogue 或 Audio ID。
- Invalid Quantity、Range 或 Empty Reward Pool。
- 不可能的 Recipe/Station Combination。
- 无法到达的 Event Prerequisite 和明显 Cycle。
- External Generation 缺少 Fallback Content。
- 已删除 ID 仍被 Save Fixture 引用。

Validation 必须可 Headless 运行，并输出 Definition ID 和 Source Path。

## Item 和 Recipe

- Reusable Rule 优先使用 Tag/Capability；真正唯一的 Content 才使用 Exact ID。
- Recipe Visibility 与 Craftability 分离。Visible Recipe 可以不可制作，并显示 Missing Requirement。
- Station Inventory Query 只包含明确允许的 Player/World Container。
- Ingredient Consumption 和 Output 必须 Atomic。
- Balance Value 位于 Definition 中，通过 Content Review 修改，而不是编辑 Script。

## Furniture 和 Room

- Feature-specific Visual 与对应 Furniture/Room Scene 放在一起。
- Definition 引用 Scene 和 Placement Profile。
- Placement Test 覆盖 Collision、Invalid Surface、阻断 Required Path、Pickup、Reload 和 Missing Definition。
- Furniture Capability 决定 Interaction 和 Action Unlock。
- Decorative Asset 不会自动获得 Gameplay Behavior。

## Top-down Map

开始 Production Map 前，必须为 Tile/Grid Size、Free/Grid Placement、Room Coordinate Convention、Depth Sorting、Collision Layer、Navigation Layer 和 Camera Framing 记录 Decision。

Map Source Asset 和 Imported Godot Resource 必须可区分。不得手动编辑 Generated Import File。

## Character 和 Pet Asset

一个 Asset Set 可以包含：

- Base Sprite 或 Model Source。
- Directional Idle、Move、Interact、Action、Sleep、Need 和 Reaction Animation。
- Collision 和 Interaction Shape。
- Navigation Behavior。
- Portrait 和 Dialogue Expression。
- Audio Cue。

Optional Animation 缺失时，Gameplay 必须使用 Documented Fallback，而不是让 Feature 失败。

## UI Asset

- UI 支持 Localization Text Expansion、Scalable Window 和 Input Focus Navigation。
- 必要时，Icon 必须拥有 Text、Tooltip 或 Accessible Meaning。
- 除非存在 Localized Asset Pipeline，否则不得把用户可见文本写入 Texture。
- Tutorial Cue 引用 Mapped Action，不引用 Literal Keyboard Label。
- Interactive UI 必须定义 normal、hover、pressed、focus-visible 和 disabled 的视觉状态，即使某些状态在当前 Version 暂不出现。
- Theme color、spacing、font size、StyleBox 和 state style 必须集中在 Theme Resource、Scene Theme Override 或等价单一配置位置，不能散落在 gameplay script。
- 本项目的 Godot UI Theme Token Owner 是 `godot/ui/style/style.gd`。UI Implementation 应引用 `GameStyle.PRIMARY`、`GameStyle.SECONDARY` 等 token，而不是在 Button、Panel、Scene Script 或 Theme Builder 中直接写 Color literal。
- Title、Button、Panel、Modal、Spacing 和 state style 的可复用 visual constants 也归 `GameStyle` 管理。Version 可以新增 token，但不能在 Scene 中建立第二套 magic number。
- Hover、pressed 和 focus-visible 状态不能改变 Control 的最小尺寸、Container separation 或整体 Layout。
- `v0.1.0` 的临时主题方向为日系柔和自然色：绿色主色、暖橙强调色、浅纸色承托和深色文字。最终 Theme 需在后续 UI/Art Direction Version 中重新确认。
- UI reference 只能用于抽象 mood、hierarchy、spacing 和 interaction pattern。不得复制商业游戏 Logo、字体造型、按钮图片、Icon、Layout Composition 或可识别素材。

## Audio Pipeline

Audio 按 Purpose 和 License 组织，再通过 data-defined Sound Event/Layer 映射。预期 Audio Bus 包括 Master、Music、Ambience、Effects、UI，以及可选 Voice/Dialogue。

Soundscape Rule 组合 Weather、Room、Time、Furniture、Pet、Cooking 和 Current Action。Rule 选择 Layer；Gameplay Entity 不直接控制 Global Audio Bus。

Audio Content 需要：

- Loop 和 Transition Metadata。
- Volume/Pitch Variation Policy。
- Simultaneous-instance Limit。
- Spatial/Non-spatial Policy。
- Fallback 和 Mute Behavior。
- Attribution/License Record。

## Localization

- Internal ID 保持 Language-neutral。
- User-facing Text 使用 Localization Key。
- Player-authored Action Name 和 Letter 属于 User Content，单独保存。
- LLM Prompt/Result 声明 Input/Output Locale 和 Fallback Locale。
- UI Eval 包含 Long String 和 Missing Translation Case。

## LLM-generated Content

Photo 和 Letter 使用 Backend 中的 Versioned Template 与 Structured Context。Generation Request 引用 Safe ID 和有界 Summary，不上传不受限制的完整 World Save。

每个 Generated-content Feature 必须包含：

- Moderation 和 Privacy Rule。
- Timeout/Retry Limit。
- Cost 和 Rate Limit。
- Cache/Deduplication Key。
- Deterministic Fallback Content。
- 可区分 Generated/Fallback Content 的 Provenance/Status Metadata。
- Free-form Model Output 不得单独决定 Authoritative Gameplay Reward。

## Asset Licensing

每个 External Asset 都需要记录 Source、Author、License、Modification Note 和 Attribution Requirement。不得添加 Redistribution Right 不明确的 Asset。Generated Asset 需要 Provider/Model Provenance，以及与目标 Distribution Platform 相匹配的 Review Status。

## Placeholder Policy

Placeholder 可以用于解除 Vertical Slice Block，但必须满足：

- 名称或 Tag 明确标记为 Placeholder。
- Dimension 和 Interface 与未来 Replacement 一致。
- Test 不依赖 Placeholder-specific Visual。
- Replacement 被单独追踪到 Future Content Version。

## Content Review Checklist

- Stable ID 和 Reference 通过 Validation。
- Player-facing Text 可 Localization。
- Asset/License Metadata 存在。
- Definition 可以被 Discover 或 Unlock。
- Behavior 使用 Existing Capability，或引入 Documented New Capability。
- Rename/Remove ID 时已处理 Save Migration。
- Offline Behavior 正常。
- Multiplayer 和 External-service Policy 明确，即使当前为 Out of Scope。
