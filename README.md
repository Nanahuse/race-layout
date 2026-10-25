# race-layout

RaceTimeのレース情報とPlayer Managerのプレイヤー情報を利用する、RTAレース配信用のNodeCGバンドルです。
配信設定と表示データの生成だけを担当し、プレイヤー管理・レース監視・SRC記録取得は外部バンドルに委譲します。

## 前提

- NodeCG 2.8
- Node.js 24
- pnpm 12.4
- [Player Manager](https://github.com/Nanahuse/player-manager) v3.1.0
- [RaceTime Integration](https://github.com/Nanahuse/racetime-integration) v0.8.0

このバンドルは`player-manager`と`racetime-integration`の公開APIを利用します。
両バンドルを同じNodeCG環境へ導入し、このリポジトリを`bundles/race-layout`として配置してください。

## セットアップ

```bash
pnpm install
pnpm build
```

NodeCGを起動します。

```bash
pnpm start
```

### 開発

HMR付きの開発サーバーを起動します。

```bash
pnpm dev
```

型チェックとテスト:

```bash
pnpm typecheck
pnpm test
```

## Graphics

| Graphic | URL | 用途 |
| --- | --- | --- |
| Race 4 | `/bundles/race-layout/graphics/race-4.html` | 4人レース |
| Race 6 | `/bundles/race-layout/graphics/race-6.html` | 6人レース |
| Participants | `/bundles/race-layout/graphics/participants.html` | 全参加者 |
| Leaderboard | `/bundles/race-layout/graphics/leaderboard.html` | SRC Leaderboard |
| Result | `/bundles/race-layout/graphics/result.html` | レース結果 |

すべて1920×1080です。Race 4 / Race 6は透明背景で、映像領域には何も描画しません。

### OBSの映像配置

4人用:

- 映像サイズ: 800×450
- 上段: `(0, 0)` と `(800, 0)`
- 下段: `(0, 630)` と `(800, 630)`
- 右側情報パネル: `x=1600`, 幅320
- プレイヤーバー: `y=450` から180pxの中央帯

6人用:

- 映像サイズ: 640×360
- 上段: `y=232`、`x=0 / 640 / 1280`
- 下段: `y=720`、`x=0 / 640 / 1280`
- 上部情報パネル: 高さ232
- プレイヤーバー: `y=592` から128pxの中央帯

映像は16:9のまま配置し、クロップや引き伸ばしは行いません。

## Broadcast Control

Dashboardの`Broadcast Control`で配信設定を編集します。

- Race: 監視中レースの選択、RaceTime URLの指定
- Layout: 6スロットへの走者配置、並べ替え、4人/6人プレビュー
- Presentation: Event、Category、実況者、SRC Mapping
- Status: RaceTime / Player Manager / SRCの状態確認、記録の再取得、監視の再接続

編集内容はブラウザ内のDraftとして保持され、**「配信に反映」**を押したときだけ単一の`broadcast-config` Replicantへ保存されます。
`broadcast-config`はRevisionで競合を検出します。

4人用と6人用は別々のGraphic URLです。Dashboardの4人/6人切り替えは配置プレビューだけを変更し、OBSシーンは操作しません。

## データの流れ

- `broadcast-config`だけを永続化します。
- RaceTimeの監視は`watchRace`で確立し、このバンドルが取得した`watchId`だけを`unwatchRace`で解除します。
- SRC記録はレース・Mapping・対象プレイヤーの変更時と明示的な再取得時にだけ取得します。
- 古い非同期応答は現在のレースと照合し、一致しない場合は破棄します。
- Graphicsは非永続Presentation Replicantを購読するだけで、外部APIへ直接アクセスしません。
