# Дизайн-система Вязи (MindMap24)

Carbon отвергнут. Визуальный язык — Figma-кит [MindMap — Task management UI Kit](https://www.figma.com/design/kc2pEmbQZMItj7QIhw4LC3/MindMap---Task-managment-UI-Kit-100--free--Personalized---Community-?node-id=0-1) (fileKey `kc2pEmbQZMItj7QIhw4LC3`), адаптированный под десктоп: доска, превью-сайдбар, конструктор XYFlow.

Источник правды в коде: `apps/web/src/app.css` (`:root`), примитивы в `apps/web/src/components/ui.tsx`.

## Цвета

| Токен | Hex | Где |
|---|---|---|
| `--vyaz-coral` | `#fb605e` | CTA, шапка, основная связь, тип «Задача» |
| `--vyaz-coral-mid` | `#fc8887` | hover / заливка |
| `--vyaz-coral-soft` | `#fda6a5` | мягкий фон |
| `--vyaz-coral-deep` | `#bc4847` | нажатие |
| `--vyaz-wine` | `#ad3642` | ключевая связь, опасные действия, ошибка |
| `--vyaz-navy` | `#252b39` | основной текст |
| `--vyaz-ink` | `#1b202a` | тёмные пилюли |
| `--vyaz-ink-deep` | `#141820` | глубокий фон |
| `--vyaz-muted` | `#5b606a` | подписи полей |
| `--vyaz-muted-soft` | `#848890` | косвенная связь |
| `--vyaz-line` | `#ece8e1` | бордер ghost-кнопок |
| `--vyaz-paper` | `#f7f4ef` | фон приложения, поля |
| `--vyaz-cream` | `#fff8f2` | карточки |
| `--vyaz-white` | `#ffffff` | поверхности |
| `--vyaz-success` | `#24a148` | успех |
| `--vyaz-warn` | `#e8b54b` | предупреждение |
| `--vyaz-info` | `#3b82c4` | информация |
| `--vyaz-mint` | `#7dd3c0` | тип «Заметка» |
| `--vyaz-peach` | `#f4b183` | тип «Скетч» |
| `--vyaz-lilac` | `#c4b5fd` | тип «Дизайн» |
| `--vyaz-sand` | `#f5e6c8` | пастель доски |
| `--vyaz-sky` | `#9ec9f0` | пастель доски |

Светлая тема. `color-scheme: light`.

## Типографика

- UI и карточки: **Inter** 400 / 600 / 700 (`@fontsource/inter`)
- Заголовки, бренд в шапке: **Crimson Text** 700 (`@fontsource/crimson-text`)
- Базовый размер: 16px, line-height 1.5
- Не IBM Plex

## Форма

| Токен | Значение |
|---|---|
| `--vyaz-radius-sm` | 12px |
| `--vyaz-radius` | 20px (поля, нотисы) |
| `--vyaz-radius-lg` | 24px (шапка, диалоги) |
| `--vyaz-radius-pill` | 999px (кнопки) |
| нода конструктора | 18px |
| тень | `0 12px 32px rgba(27, 32, 42, 0.08)` |
| тень мягкая | `0 6px 18px rgba(27, 32, 42, 0.06)` |

## Компоненты

- Кнопки: жирные пилюли `coral` / `ink` / `ghost` / `danger`
- Шапка: коралловый «blob» с белым логотипом Crimson Text
- Логин: коралловый фон, белая карточка входа
- Карточка доски: крем, тип-бейдж цветом `TaskType`, корзина внутри карточки
- Сайдбар превью: оверлей поверх доски, не сжимает колонки
- Примитивы свои, не Carbon и не shadcn

## Связи на холсте

Подписи на рёбрах нет — виды объясняются легендой в панели инструментов.

| Kind | Вид |
|---|---|
| primary | коралл `#fb605e`, 2px |
| secondary | серый `#848890`, 2px, пунктир `6 4` |
| key | вино `#ad3642`, 4px |

Порты со всех четырёх сторон: и source, и target.

## Типы задач (сиды)

| slug | Цвет |
|---|---|
| `task` | `#fb605e` |
| `note` | `#7dd3c0` |
| `sketch` | `#f4b183` |
| `design` | `#c4b5fd` |

## Не делать

- Не возвращать Carbon / IBM Plex / Blue 60 как основу UI
- Не ставить shadcn или Tailwind как дизайн-систему
- Не писать подписи kind на самом ребре
