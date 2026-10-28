# Architecture — Вязь

AI-first graph task tracker. Имя продукта: **Вязь**. В коде и slug: `vyaz`.

Связанные документы: [PROMPT.md](./PROMPT.md) · [TZ.md](./TZ.md) · [plan.md](./plan.md) · [README.md](./README.md)

---

## 0. Зачем этот документ

Это единый источник правды для инженера. Если спор «что такое задача / связь / пространство» — открываем этот файл, а не чат.

Вязь родилась из классического Todo (`User → Project → Task → Subtask`) и сознательно ломает иерархию: **узел + типизированное ребро** вместо `parent_id`.

---

## 1. Философия

Классический трекер хранит **владение**: проект владеет задачами, задача владеет подзадачами.

Вязь хранит **отношения между задачами**. Вершина графа всегда `Task`. У задачи есть тип: дефолтные `task`, `note`, `sketch`, `design` или свой. Новая ветка в конструкторе — новый таск выбранного типа, а не сущность другого класса. Смысл связи задаёт ребро, характер карточки — `TaskType`.

Следствия:

- Открыть таск с доски = попасть в **превью** (классическая карточка + сводка связей).
- В **конструктор** (focus mindmap) вход отдельной кнопкой / действием из превью.
- Любая ветка на холсте — тоже задача: у неё свой статус, срок, превью и свой конструктор.
- Канбан, список, таймлайн — проекции того же графа задач, не отдельные модели.
- ИИ работает не «по тексту карточки», а по **подграфу задач + подключённому контексту продукта**.

```text
Board (проекция по status)
        │ клик по карточке
        ▼
Task Preview (поля, описание, связи)
        │ «Открыть конструктор»
        ▼
Focus Mindmap (ветки = новые или существующие задачи)
        │ фильтр рёбер
        ▼
Primary / Secondary / Key paths  — все вершины Task
```

---

## 2. Что взято из DeepSeek и что изменено

Чат DeepSeek дал сильную рамку: Task/Edge first-class, mindmap как конструктор связей, агенты, RAG, GitHub. Это сохраняем, с поправкой на превью.

Чего в черновике не хватало или что опасно для первой реализации:

| Тема | DeepSeek | Вязь |
|---|---|---|
| Три пути из промпта | Смешаны в плоский список `RelationType` | Два уровня: `RelationKind` (primary/secondary/key) + `RelationType` |
| Открытие таска | сразу mindmap | Доска → **превью** → явный вход в конструктор |
| Вершины графа | отдельные сущности note/sketch/document | Всегда `Task`; тип карточки — `TaskType` |
| Типы задач | хардкод enum | Каталог: дефолтные `task/note/sketch/design` + пользовательские |
| Конфиг | только WorkspaceConfig | GlobalConfig → WorkspaceConfig с наследованием |
| Стек | FastAPI + Kafka + K8s сразу | FastAPI + React с дня один; Kafka/K8s не тащим |
| UI | не зафиксирован | MindMap24 (`carbon-design-design.md`, свои примитивы) |
| Event sourcing / CRDT / 1M узлов | сразу в ядре | event log в Postgres; CRDT и шардинг — после беты |
| Sketch / заметки | либо отдельные узлы, либо только вложения | типы задачи; редактор (markdown/canvas) зависит от типа |
| Эволюция | timeline узла | версия задачи + история рёбер + diff подграфа |

Принцип: **домен богатый, инфраструктура тонкая**, пока не доказан core loop.

---

## 3. Доменные сущности

### 3.1. Identity

| Сущность | Смысл |
|---|---|
| `User` | Человек. Владеет или состоит в пространствах. |
| `Workspace` | Пространство продукта. Один продукт = один граф. |
| `Membership` | Роль пользователя в пространстве: `owner`, `admin`, `member`, `viewer`. |

`Project` из учебного Todo **не отдельная сущность**. Проект — это workspace. Крупные контуры («релиз», «онбординг») — обычные задачи на основном пути.

### 3.2. Task — единственная вершина графа

Ветка, подзадача, заметка, скетч, дизайн, косвенный контекст и ключевая зависимость — всё это **задачи**. Различает их `TaskType`, а не отдельная таблица сущностей.

```text
Task
  id, workspaceId
  typeId          # → TaskType (task | note | sketch | design | custom)
  title
  body            # markdown; для sketch/design может дополняться canvas JSON
  sketch          # JSON холста, если тип с editor=canvas
  attachments[]   # файлы, ссылки на Figma, документы
  status          # backlog | todo | in_progress | blocked | review | done | archived
  priority        # none | low | medium | high | critical
  assigneeIds[]
  dueAt, startedAt, completedAt
  fields          # кастомные поля: дефолтные + из схемы TaskType
  aiSummary
  embeddingId
  version
  createdBy, updatedBy
  createdAt, updatedAt
  deletedAt       # soft delete
```

Координаты на холсте (`x,y`) хранятся в `ViewState` конструктора, не в самой задаче.

Правила:

- Создать ветку = `create Task(typeId)` + `create Edge`.
- У каждой задачи, любого типа, есть превью и конструктор.
- Задача **не имеет** `parentId`. Иерархия — ребро `parent_of` с kind=`primary`.
- Смена типа задачи — явное действие, пишет Event. Нельзя сменить тип так, чтобы сломать обязательные поля без миграции `fields`.

Поведение:

- `preview()` → карточка в формате своего TaskType + сводка связей.
- `openConstructor()` → focus graph.
- `branch(kind, relationType, taskType?, title?)` → новая задача выбранного типа + ребро.
- `link(target: Task, kind, type, meta)` → `Edge`.
- `neighbors(kind?, type?, depth?)`.
- `snapshot()` → версия для истории.

### 3.2.1. TaskType — каталог типов задач

Не путать с `RelationType`. `TaskType` отвечает на вопрос «что это за карточка», `RelationType` — «в каком смысле две карточки связаны».

```text
TaskType
  id
  scope: global | workspace
  workspaceId     # null для глобальных/встроенных
  slug            # task, note, sketch, design, bug, research, ...
  label
  icon, color
  builtIn: bool
  enabled: bool
  editor: markdown | canvas | design | mixed
  defaultCardFormatId
  showStatus, showAssignee, showDueDate   # какие поля трекера видны
  extraFields[]   # схема доп. полей для этого типа
```

**Дефолтный каталог (built-in, нельзя удалить, можно выключить кроме `task`):**

| slug | Зачем | Редактор превью | На доске |
|---|---|---|---|
| `task` | Обычная работа | markdown + поля трекера | да, по умолчанию |
| `note` | Заметка, ресёрч, мысль | markdown-first | опционально (фильтр типа) |
| `sketch` | Зарисовка | canvas (на MVP — markdown + вложения) | опционально |
| `design` | Дизайн, макет | design: вложения, ссылка на Figma, позже холст | опционально |

**Пользовательские типы:** создаются в GlobalConfig (доступны всем пространствам аккаунта) и в WorkspaceConfig (только этот продукт). Обязательны `slug`, `label`, `editor`. Наследуют общую модель Task.

Примеры своих типов: `bug`, `spike`, `decision`, `interview`, `hypothesis`.

Наследование: workspace видит глобальные типы + свои. Может выключить глобальный тип у себя. Не может править `builtIn`-схему, только enabled и локальный CardFormat.

### 3.3. Edge — связь как сущность

Ребро — не атрибут карточки. У него своя история, автор и вес.

```text
Edge
  id, workspaceId
  sourceId, targetId
  kind: primary | secondary | key
  type: RelationType          # конкретная семантика внутри kind
  directed: true              # по умолчанию ориентированное
  weight                      # 0..1, для ранжирования и ИИ
  meta                        # почему связаны, цитата, confidence
  createdByActor              # user | agent
  createdAt, updatedAt
  deletedAt
```

Между двумя узлами разрешено несколько рёбер **разных** `(kind, type)`. Дубликат той же пары запрещён.

### 3.4. RelationKind — три пути из промпта

Это главный инвариант продукта.

| Kind | Из промпта | Смысл | Ограничения |
|---|---|---|---|
| `primary` | основной путь, основной контекст → основной | Хребет продукта: задача → следующая главная задача | Циклы запрещены. Главная нить в конструкторе |
| `secondary` | второстепенный, основной → косвенный | Косвенные задачи, часто типа `note` / `sketch` / `design`, но любой тип допустим | Циклы допустимы. Не двигают done родителя автоматически |
| `key` | ключевой путь: один вытекает из другого и не существует автономно | Онтологическая зависимость двух задач. Удаление/архив источника ломает смысл цели | Циклы запрещены. Удаление блокируется или каскадно предупреждает. Транзитивно |

`RelationType` уточняет kind, но не заменяет его.

Базовый реестр типов (расширяется в конфиге пространства):

| Type | Default kind | Назначение |
|---|---|---|
| `parent_of` | primary | Совместимость с деревом/канбан-группами |
| `next` | primary | Последовательность основного контекста |
| `depends_on` | primary | Временная/workflow-зависимость |
| `relates_to` | secondary | Слабая смысловая связь двух задач |
| `inspired_by` | secondary | Косвенный контекст (другая задача) |
| `supports` | secondary | Вспомогательная задача к основной |
| `derives_from` | key | Смысл цели следует из источника |
| `part_of_key` | key | Часть, без которой целое не существует |
| `implements` | secondary | Задача про код/PR (сам PR — вложение или context source) |
| `blocks` | primary | Жёсткая блокировка работы |
| `duplicates` | secondary | Кандидаты на слияние |
| `contradicts` | secondary | Конфликт двух задач-решений |

Кастомные типы обязаны указать `kind`. Без kind ребро создать нельзя.

### 3.5. Graph / FocusGraph

Граф не хранится отдельно. Это проекция `nodes + edges` workspace.

Операции:

- `preview(taskId)` — данные экрана превью: задача + рёбра, сгруппированные по kind, без раскладки холста.
- `focus(taskId, radius, kinds?)` — то, что видит пользователь в конструкторе.
- `primaryPath(from, to)` — путь только по `kind=primary`.
- `keyClosure(nodeId)` — все узлы, без которых данный не существует, и наоборот.
- `board(statusGroupBy)` — колонки канбана.
- `detectCycles(kind)` — для primary и key.
- `diff(fromVersion, toVersion)` — эволюция подграфа.

### 3.6. View и форматы

Чтобы «установка формата досок и карточек» была данными, а не хардкодом:

```text
BoardFormat     # колонки, wip-лимиты
CardFormat      # поля карточки; может быть привязан к TaskType
MindmapFormat   # раскладка, какие kind рисуются по умолчанию, цвет рёбер
ViewState       # персональные координаты узлов в конкретном focus
```

### 3.7. Конфиг: глобальный и продуктовый

```text
GlobalConfig                # платформа / аккаунт
  defaultRelationTypes
  defaultTaskTypes          # task, note, sketch, design + свои глобальные
  defaultBoardFormats
  availableProviders        # какие AI-провайдеры вообще разрешены
  defaultAgents

WorkspaceConfig             # продукт
  inherits GlobalConfig
  providers[]               # ключи, модели, лимиты
  agents[]
  enabledRelationTypes[]
  enabledTaskTypes[]        # какие типы видны + локальные custom
  customTaskTypes[]
  boardFormats[], cardFormats[], mindmapFormats[]
  contextSources[]
```

Наследование: workspace может выключить тип связи или тип задачи, добавить своего агента, сменить модель, завести свой `TaskType`. Не может использовать провайдер, запрещённый глобально. Не может удалить built-in `task`.

### 3.8. AI-слой

ИИ не пишет в граф напрямую в обход человека (на MVP и по умолчанию).

```text
AIProvider        # openai-compatible | anthropic | ollama | custom http
Agent
  role: linker | summarizer | planner | researcher | reviewer | estimator | custom
  systemPrompt, tools[], triggers[]
AgentRun          # журнал запуска
Suggestion        # предлагаемое ребро / правка узла / декомпозиция
  payload, confidence, status: pending | accepted | rejected
```

Инструменты агента (function calling): `search_tasks`, `get_preview`, `get_focus_graph`, `create_task_draft`, `suggest_edge`, `summarize_subgraph`, `search_context`.

На MVP пишущие инструменты создают `Suggestion` или `draft`, не живые задачи.

### 3.9. Контекст продукта

```text
ContextSource
  type: github_repo | document_upload | url
  syncPolicy, lastSyncedAt, credentialsRef

ContextChunk
  sourceId, nodeHints[], text, embedding, locator  # path, commit, page

ContextBundle
  # собирается для агента: focus graph + ближайшие chunks + git-сигналы
```

GitHub на старте — read-only: README, issues, PRs, последние коммиты. Маппинг на задачи — через рёбра `implements` / `supports` или через suggestions линкера. Файлы и скетчи, загруженные в превью, остаются attachments задачи.

### 3.10. История и эволюция

Каждая мутация узла/ребра пишет событие:

```text
Event
  workspaceId, actor (user|agent)
  action, entityType, entityId
  before, after
  at
```

Этого достаточно для undo, аудита агентов и «как менялся этот таск за спринт». Полный event sourcing с проекциями — не нужен до масштаба.

---

## 4. Слои системы

```text
┌─────────────────────────────────────────────┐
│  Web UI  (Vite + React + MindMap24)          │
│  Board · Task Preview · Constructor · AI Chat │
└──────────────────┬──────────────────────────┘
                   │ REST + SSE
┌──────────────────▼──────────────────────────┐
│  Application                                 │
│  Workspace · Task · Edge · Graph · View      │
│  AgentOrchestrator · Context · Suggestion    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Domain                                      │
│  Task, Edge, RelationKind, FocusGraph,       │
│  invariants (cycles, key-constraints)        │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Infrastructure                              │
│  Postgres · SQLAlchemy · Files · LLM SDK     │
│  GitHub API · NetworkX · embeddings later    │
└─────────────────────────────────────────────┘
```

На фазах 1–2 нет Kafka, отдельного worker-кластера и graph-cache. ИИ стримится SSE с FastAPI. Фоновые sync GitHub — `BackgroundTasks`, очередь позже.

---

## 5. Модель данных (логическая)

```text
User 1──* Membership *──1 Workspace
Workspace 1──1 WorkspaceConfig
Workspace 1──* Task
Workspace 1──* TaskType          # плюс глобальные built-in
Task      *──1 TaskType
Workspace 1──* Edge
Workspace 1──* Event
Workspace 1──* ContextSource
Workspace 1──* AgentConfig
Workspace 1──* Suggestion
Task  *──* Task                  via Edge
Task  1──* Attachment
ContextSource 1──* ContextChunk
Task 0──* ContextChunk           optional hint links
```

Ключевые индексы:

- `edge(workspaceId, sourceId)`
- `edge(workspaceId, targetId)`
- `edge(workspaceId, kind)`
- `task(workspaceId, status)`
- `task(workspaceId, typeId)`
- `event(workspaceId, entityId, at)`

Инвариант БД: `source` и `target` принадлежат тому же `workspaceId`, что и ребро. Проверяется приложением и желательно CHECK/trigger.

---

## 6. API (контракт ядра)

Префикс `/api/v1`.

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/workspaces` | Создать пространство |
| GET | `/workspaces/:id/board` | Канбан-проекция |
| GET | `/tasks/:id` | Превью задачи |
| GET | `/tasks/:id/focus` | Конструктор (mindmap вокруг задачи) |
| POST | `/tasks` | Создать задачу (с доски, из превью или как ветку), обязателен `typeId` |
| PATCH | `/tasks/:id` | Обновить задачу, включая смену типа |
| GET | `/task-types` | Каталог типов (глобальные + пространства) |
| POST | `/task-types` | Свой тип задачи |
| PATCH | `/task-types/:id` | Включить/выключить, поля, редактор |
| POST | `/edges` | Связать |
| DELETE | `/edges/:id` | Снять связь |
| GET | `/graph/path` | Путь `from → to` с фильтром kind |
| GET | `/graph/key-closure/:id` | Ключевое замыкание |
| GET | `/tasks/:id/events` | История |
| POST | `/ai/chat` | Чат с инструментами, SSE |
| POST | `/ai/suggestions/:id/accept` | Принять предложение |
| POST | `/context-sources` | Подключить GitHub/файл |
| POST | `/context-sources/:id/sync` | Синхронизировать |

Все мутации пишут `Event` в той же транзакции.

---

## 7. UX-архитектура

1. **Home / Workspaces** — список продуктов.
2. **Board** — колонки по статусу. Карточка показывает тип (`task`/`note`/`sketch`/`design`/свой) и badge связей. Фильтр по типам.
3. **Click по карточке** — **превью** в формате этого TaskType: поля трекера (если тип их показывает), редактор (markdown/canvas/design), связи по трём слоям, история, AI, кнопка «Открыть конструктор».
4. **Конструктор** — отдельный экран/режим. Центр — текущая задача. Каждая ветка — карточка своего типа. Клик по ветке открывает **её превью**.
5. **Создание ветки** — выбор TaskType + новая задача + ребро. Подсказка: на `primary` по умолчанию `task`, на `secondary` — `note` / `sketch` / `design`. Drag к уже существующей задаче — только ребро.
6. **Создание связи** — drag от пина к пину + выбор kind/type. Дефолт: `primary/next` для хребта, иначе спрашиваем слой.
7. **Фильтры на холсте** — тумблеры Primary / Secondary / Key.
8. **Предупреждение key** — удаление/архив задачи, если она в key-пути.
9. **AI-панель** — в превью про эту задачу; в конструкторе — про подграф.

Классика не теряется: drag карточки между колонками меняет `status` той же задачи. Из превью статус тоже редактируется.

---

## 8. Инварианты графа

1. Ребро не может смотреть само на себя.
2. Узлы ребра — один workspace.
3. `primary` и `key` ацикличны.
4. `key` транзитивен для предупреждений: если A key→ B key→ C, удаление A затрагивает C.
5. Soft delete узла скрывает инцидентные рёбра, не уничтожает историю.
6. Агент не создаёт живое `key`-ребро без accept пользователя.
7. Смена `kind` у существующего ребра — это новое событие, не «тихий update».
8. Обе стороны ребра — всегда `Task` (любого TaskType). Файл сам по себе не вершина: он вложение задачи типа `design`/`note`/`task`.

---

## 9. Стек (зафиксирован)

Два процесса, одна БД. Визуальный закон — MindMap24, не Carbon и не shadcn.

```text
[ web: Vite + React + TypeScript + XYFlow ]
                    │  REST + SSE  (OpenAPI)
[ api: FastAPI + SQLAlchemy + Pydantic ]
                    │
[ Postgres 16 ]     [ файлы: local / S3 ]
```

### Backend — FastAPI (да, это основной API)

Python здесь не «можно», а **нужен**: агенты, RAG, эмбеддинги, NetworkX (циклы, пути, key-closure), стриминг LLM.

| Слой | Выбор |
|---|---|
| Runtime | Python 3.12, Uvicorn |
| API | FastAPI, Pydantic v2, SSE для `/ai/chat` |
| ORM | SQLAlchemy 2.0 + Alembic |
| БД | PostgreSQL 16 |
| Граф | SQL + NetworkX в процессе API (без отдельного graph-сервиса) |
| ИИ | OpenAI-compatible SDK (OpenAI / OpenRouter / Ollama) |
| Очередь | не в MVP; позже ARQ. Фоновые sync — `BackgroundTasks` |
| Auth | JWT в httpOnly cookie (или session), RBAC в API |
| Контракт | OpenAPI из FastAPI → генерация TS-клиента (`openapi-typescript` / Orval) |

Не тащим с фазы 0: Kafka, Celery, Kubernetes, отдельный worker-кластер.

### Frontend — React + MindMap24

| Слой | Выбор |
|---|---|
| Сборка | Vite + React + TypeScript |
| UI-kit | свои примитивы (кнопка, поле, диалог) |
| Токены | `carbon-design-design.md`: коралл `#fb605e`, Inter, Crimson Text |
| Холст конструктора | **XYFlow** (`@xyflow/react`) |
| Автоукладка | ELK (`elkjs`) — radial / layered под focus; ручной drag сохраняется в ViewState |
| Ноды и рёбра | свои компоненты: радиус ~18px, пастель, цвет ребра = RelationKind |
| Состояние холста | Zustand (позиции, selection) + TanStack Query (граф с API) |
| Не используем | Tailwind как дизайн-система, shadcn/ui, MUI, jsmind / markmap / MindElixir |

### Почему XYFlow, а не «mindmap-библиотека»

Конструктор «Вязь» — **редактор графа задач**, не дерево из одного корня.

Нужно из коробки: кастомные ноды (типы `task`/`note`/`sketch`/`design`), drag-to-connect, разные стили рёбер по kind, клик → превью, zoom/pan, контролируемое состояние. Это модель XYFlow.

Классические mindmap-движки (Mind Elixir, jsMind, Markmap) рисуют дерево и плохо живут с мультиграфом, тремя слоями связей и карточками задач. Cytoscape/Sigma сильны как просмотр больших графов, слабы как конструктор. Их оставляем запасным путём, если focus > 3–5k узлов.

Раскладка «как mindmap»: ELK `radial` или `layered` вокруг фокус-задачи. Пользователь может подвинуть ноды — координаты пишутся в `ViewState`, не в Task.

Почему не Next.js как монолит: API живёт в FastAPI. Next как BFF только путал бы, куда класть ручки. Vite + SPA достаточно для доски, превью и конструктора.

### Infra (локально)

- Docker Compose: `postgres` + `api` (+ `web` по желанию; в dev web можно с `vite`).
- Репозиторий:

```text
apps/api/          # FastAPI
apps/web/          # Vite + React
docker-compose.yml
carbon-design-design.md
```

**После ядра продукта:** pgvector, ARQ для GitHub/эмбеддингов, WebGL если холст > 3–5k узлов, Yjs для совместного конструктора.

---

## 10. Нефункциональные требования (реалистичные)

| Метрика | Цель на MVP |
|---|---|
| Рендер focus graph до 300 узлов | плавно, 60fps в типичном ноутбуке |
| Board до 500 карточек | без виртуализации ещё ок, заложить virtual list |
| API мутации без ИИ | P95 < 300ms локально |
| AI stream первого токена | < 2s при живом провайдере |
| Undo последнего действия | всегда |
| Экспорт workspace | JSON графа без потери kind/type |

Цели «10k узлов / 1M рёбер / 99.9%» — не MVP. Они появляются в плане как горизонт, не как Definition of Done фазы 1.

---

## 11. Безопасность

- Секреты провайдеров и GitHub-токены не в `WorkspaceConfig` открытым текстом — encrypted at rest или vault.
- Агенты работают с ролью `agent` и полным audit log.
- RBAC: viewer не мутирует граф; member мутирует задачи/рёбра; admin — конфиг и источники; owner — удаление workspace.
- Prompt injection: контекст из GitHub/документов помечать как untrusted data в системном промпте.
- Rate limit на `/ai/*`.

---

## 12. Риски

| Риск | Почему реален | Что делаем |
|---|---|---|
| Граф станет спагетти | Любая связь разрешена | Kind-фильтры, кластеры secondary, лимиты на видимый радиус |
| ИИ наплодит ложные key-связи | Слишком сильный инвариант | Suggestions + запрет авто-key |
| Пользователь потеряется в mindmap | Непривычный UX | Доска → превью; конструктор только по явной кнопке; из конструктора — назад в превью и на доску |
| Scope creep инфраструктуры | Черновик DeepSeek тянет K8s | Запрет на инфраструктуру вне текущей фазы плана |
| Путаница primary vs depends_on vs key | Похожие слова | Копирайт в UI: «хребет», «контекст», «не может существовать без» |

---

## 13. ADR (коротко)

**ADR-1. Edge first-class, без parent_id.**  
Иначе нельзя иметь несколько родителей и разные kinds.

**ADR-2. RelationKind и RelationType разделены.**  
Промпт говорит о трёх путях. Типы связи нужны для точности, фильтры UX — по kind. Не путать с `TaskType`.

**ADR-3. Everything in the graph is a Task, typed by TaskType.**  
Ветка, заметка, скетч и дизайн — задачи разного типа, не разные сущности. Иначе граф распадётся на «настоящие тикеты» и «стикеры», а свои типы придётся пилить отдельными таблицами.

**ADR-3a. Preview before constructor.**  
Клик с доски открывает превью. Конструктор — отдельный режим. Иначе ломается привычка классического трекера, которую промпт требует сохранить.

**ADR-4. FastAPI + React, не TS-монолит.**  
Граф, агенты и RAG выгоднее в Python. UI — отдельное SPA. Связка — OpenAPI. Kafka/K8s по-прежнему запрещены до беты.

**ADR-4a. MindMap24 как визуальный закон.**  
Визуал: коралл `#fb605e`, Inter + Crimson Text, радиусы 20–24, CTA-пилюли. Компоненты свои. Канбан и mindmap-ноды рисуем сами теми же токенами. Carbon и shadcn не подключаем.

**ADR-4b. XYFlow для конструктора.**  
Редактор графа, не визуализация дерева. Автоукладка — ELK. Ноды/рёбра — кастом под кит и RelationKind. Sigma/WebGL только если упрёмся в тысячи узлов.

**ADR-5. Human-in-the-loop для записи в граф.**  
Доверие к графу важнее автономности агентов.

**ADR-6. Event log в той же БД.**  
История эволюции — часть продукта, не «потом логи».

---

## 14. Как это ложится на учебный Todo

| Было | Стало |
|---|---|
| `User.projects` | `Membership` + `Workspace` |
| `Project.tasks` | задачи workspace + опционально `parent_of` |
| `Task.subtasks` | рёбра на **другие задачи**: `primary/parent_of` или `primary/next` |
| `Task.tags` | labels в `fields`; косвенная работа — secondary-задачи |
| `mark_as_done()` | смена `status`; если есть key-дети — проверка инвариантов |
| открытие задачи | превью, затем опционально конструктор |
| один класс Task | Task + каталог TaskType (`task/note/sketch/design` + свои) |
| нет | mindmap-конструктор, kinds, агенты, контекст, эволюция |

Иерархия не запрещена. Она — частный случай графа.
