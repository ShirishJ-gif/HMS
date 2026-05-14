# Property Setup Page CSS

Source page: `apps/frontend/src/pages/PropertySetupPage.tsx`

This file collects the CSS currently used by `PropertySetupPage`, including shared form, table, card, status, media, and custom select styles from `apps/frontend/src/styles.css`.

Classes used by the page:

```txt
page-header
eyebrow
page-subtitle
success
error
channel-summary-grid
channel-summary-card
info-strip
property-setup-flow
ops-layout
property-ops-layout
insight-panel
insight-panel-primary
section-heading
signal-grid
compact-signal-grid
signal-card
detail-list
form-grid
property-inline-form
property-inline-heading
wide-field
primary-button
setup-grid
stack
card
form-section-heading
pricing-rule-form
cell-note
button-row
secondary-button
muted
property-setup-media-stack
grid
two-columns
compact-form
form-title
checkbox-label
media-grid
media-card
property-setup-data-stack
table-card
table-heading
status-pill
available
table-actions
danger-button
custom-select
custom-select-trigger
custom-select-menu
custom-select-option
custom-select-empty
```

```css
:root {
  color: #1a2230;
  background: #eef2f6;
  font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  --ink: #162234;
  --muted: #667389;
  --line: rgba(22, 34, 52, 0.09);
  --paper: rgba(255, 255, 255, 0.94);
  --gold: #c58c2e;
  --green: #1d7a56;
  --blue: #1f5f8b;
  --rose: #a14a54;
  --sidebar: #242b38;
  --sidebar-muted: rgba(220, 227, 239, 0.72);
  --shell: #f5f7fa;
}

* {
  box-sizing: border-box;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.page-header h2 {
  margin: 0;
  color: var(--ink);
  font-size: 1.9rem;
  letter-spacing: 0;
}

.page-subtitle {
  max-width: 52rem;
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.96rem;
  line-height: 1.55;
}

.eyebrow {
  margin: 0 0 0.45rem;
  color: var(--gold);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.channel-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.channel-summary-card {
  display: grid;
  gap: 0.35rem;
  min-height: 8rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  padding: 1rem;
  background: var(--paper);
  box-shadow: 0 0.35rem 1rem rgba(22, 34, 52, 0.05);
}

.channel-summary-card p,
.channel-summary-card span {
  margin: 0;
  color: var(--muted);
  font-weight: 800;
}

.channel-summary-card strong {
  color: var(--ink);
  font-size: 2rem;
  letter-spacing: 0;
}

.info-strip {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  padding: 1rem;
  color: #314154;
  background: var(--paper);
  box-shadow: 0 0.35rem 1rem rgba(22, 34, 52, 0.05);
}

.info-strip strong {
  flex: 0 0 auto;
  color: var(--ink);
}

.property-setup-flow,
.property-setup-media-stack,
.property-setup-data-stack {
  display: grid;
  gap: 1rem;
}

.property-setup-flow {
  margin-top: 1rem;
}

.property-setup-flow > .ops-layout,
.property-setup-flow > .setup-grid {
  margin-top: 0;
}

.property-setup-flow .card,
.property-setup-flow .insight-panel,
.property-setup-media-stack .card,
.property-setup-media-stack .table-card,
.property-setup-media-stack .media-card {
  margin-bottom: 0;
}

.ops-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.78fr);
  gap: 1rem;
  margin-top: 1rem;
  align-items: start;
}

.property-ops-layout {
  grid-template-columns: minmax(18rem, 0.9fr) minmax(0, 1.7fr);
}

.card,
.table-card,
.media-card,
.insight-panel {
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: var(--paper);
  box-shadow: 0 0.35rem 1rem rgba(22, 34, 52, 0.05);
}

.card {
  margin-bottom: 1.25rem;
  padding: 1rem;
}

.insight-panel {
  display: grid;
  gap: 1rem;
  padding: 1.1rem;
}

.insight-panel-primary {
  background: linear-gradient(180deg, #ffffff 0%, #f5f8fb 100%);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.section-heading h3,
.table-heading h3 {
  margin: 0;
  color: var(--ink);
  letter-spacing: 0;
}

.section-heading h3 {
  font-size: 1.05rem;
}

.signal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.compact-signal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.signal-card {
  display: grid;
  gap: 0.35rem;
  border: 1px solid rgba(22, 34, 52, 0.08);
  border-radius: 0.5rem;
  padding: 0.9rem;
  background: rgba(255, 255, 255, 0.92);
}

.signal-card p,
.signal-card span {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
}

.signal-card strong {
  color: var(--ink);
  font-size: 1.4rem;
}

.detail-list {
  display: grid;
  gap: 0.7rem;
  margin: 0;
}

.detail-list div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid rgba(22, 34, 52, 0.08);
  padding-top: 0.7rem;
}

.detail-list div:first-child {
  border-top: 0;
  padding-top: 0;
}

.detail-list dt {
  color: #98a0b3;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.detail-list dd {
  margin: 0;
  color: var(--ink);
  font-weight: 900;
  text-align: right;
}

.setup-grid {
  display: grid;
  grid-template-columns: 1.45fr repeat(3, 1fr);
  gap: 1rem;
  margin-top: 1rem;
}

.setup-grid.stack {
  grid-template-columns: 1fr;
}

.grid {
  display: grid;
  gap: 1rem;
}

.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 1rem;
  align-items: end;
}

.property-inline-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.compact-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.form-section-heading,
.property-inline-heading {
  grid-column: 1 / -1;
}

.form-title {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--ink);
}

label {
  display: grid;
  gap: 0.42rem;
  color: #46506a;
  font-size: 0.82rem;
  font-weight: 800;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid rgba(91, 103, 138, 0.14);
  border-radius: 0.95rem;
  padding: 0.88rem 0.95rem;
  color: #172033;
  background-color: rgba(255, 255, 255, 0.98);
  outline: none;
  transition:
    border 150ms ease,
    box-shadow 150ms ease,
    background 150ms ease;
}

input:focus,
select:focus,
textarea:focus {
  border-color: rgba(84, 116, 255, 0.36);
  background-color: #fff;
  box-shadow: 0 0 0 0.22rem rgba(93, 111, 221, 0.08);
}

textarea {
  min-height: 5rem;
  resize: vertical;
}

select {
  appearance: none;
  padding-right: 2.75rem;
  cursor: pointer;
  font-weight: 700;
  background-color: rgba(255, 255, 255, 0.99);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
  background-image:
    linear-gradient(45deg, transparent 50%, #667085 50%),
    linear-gradient(135deg, #667085 50%, transparent 50%);
  background-position:
    calc(100% - 1.35rem) 50%,
    calc(100% - 1rem) 50%;
  background-repeat: no-repeat;
  background-size:
    0.35rem 0.35rem,
    0.35rem 0.35rem;
}

select:hover {
  border-color: rgba(91, 103, 138, 0.24);
  background-color: #fff;
}

select option {
  background: #fff;
  color: #172033;
  font-weight: 700;
  line-height: 1.45;
}

.custom-select {
  position: relative;
}

.custom-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 3.25rem;
  border: 1px solid rgba(91, 103, 138, 0.14);
  border-radius: 0.95rem;
  padding: 0.88rem 2.9rem 0.88rem 0.95rem;
  color: #172033;
  font-size: 0.95rem;
  font-weight: 700;
  text-align: left;
  background: #fff;
  transition:
    border 150ms ease,
    background 150ms ease,
    color 150ms ease;
  cursor: pointer;
}

.custom-select-trigger::before,
.custom-select-trigger::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 0.48rem;
  height: 2px;
  border-radius: 999px;
  background: #667085;
  transition: transform 150ms ease, background 150ms ease;
}

.custom-select-trigger::before {
  right: 1.28rem;
  transform: translateY(-50%) rotate(45deg);
}

.custom-select-trigger::after {
  right: 1rem;
  transform: translateY(-50%) rotate(-45deg);
}

.custom-select:hover .custom-select-trigger,
.custom-select.open .custom-select-trigger {
  background: #fff;
}

.custom-select:hover .custom-select-trigger {
  border-color: rgba(91, 103, 138, 0.14);
}

.custom-select.open .custom-select-trigger {
  border-color: rgba(84, 116, 255, 0.36);
}

.custom-select.open .custom-select-trigger::before {
  transform: translateY(-50%) rotate(-45deg);
}

.custom-select.open .custom-select-trigger::after {
  transform: translateY(-50%) rotate(45deg);
}

.custom-select.disabled .custom-select-trigger,
.custom-select-trigger:disabled {
  cursor: not-allowed;
  color: #98a0b3;
  background: rgba(244, 247, 250, 0.96);
}

.custom-select-trigger .placeholder {
  color: #98a0b3;
}

.custom-select-menu {
  position: absolute;
  top: calc(100% + 0.4rem);
  left: 0;
  right: 0;
  z-index: 40;
  display: grid;
  gap: 0.28rem;
  max-height: 18rem;
  overflow-y: auto;
  border: 1px solid rgba(91, 103, 138, 0.12);
  border-radius: 1rem;
  padding: 0.5rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.995), rgba(248, 250, 252, 0.98)),
    rgba(255, 255, 255, 0.99);
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.custom-select-menu::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.custom-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 0.78rem;
  padding: 0.76rem 0.82rem;
  color: #172033;
  font-size: 0.9rem;
  font-weight: 700;
  text-align: left;
  background: transparent;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease;
}

.custom-select-option span {
  color: inherit;
  font-weight: inherit;
  line-height: 1.45;
}

.custom-select-option strong {
  color: #145f47;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.custom-select-option.highlighted,
.custom-select-option:hover {
  border-color: rgba(93, 111, 221, 0.14);
  background: rgba(241, 244, 255, 0.94);
}

.custom-select-option.selected {
  border-color: rgba(31, 122, 92, 0.16);
  background: rgba(239, 249, 244, 0.96);
}

.custom-select-empty {
  padding: 0.78rem 0.82rem;
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 700;
}

.wide-field {
  grid-column: span 2;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.checkbox-label input {
  width: auto;
}

.primary-button,
.link-button {
  border: 0;
  border-radius: 999px;
  font-weight: 900;
  transition:
    transform 150ms ease,
    box-shadow 150ms ease,
    background 150ms ease;
}

.primary-button {
  padding: 0.8rem 1.1rem;
  color: #fff;
  background: linear-gradient(135deg, #237a57, #145f47);
}

.primary-button:hover,
.link-button:hover,
.secondary-button:hover {
  transform: translateY(-1px);
}

.secondary-button {
  border: 1px solid rgba(91, 103, 138, 0.14);
  border-radius: 999px;
  padding: 0.72rem 0.98rem;
  color: var(--ink);
  font-weight: 800;
  background: rgba(255, 255, 255, 0.95);
}

.danger-button {
  color: #b42318;
  border-color: rgba(180, 35, 24, 0.18);
  background: rgba(180, 35, 24, 0.04);
}

.button-row,
.table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.cell-note {
  display: block;
  margin-top: 0.25rem;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
}

.muted {
  color: var(--muted);
}

.error,
.success {
  border-radius: 1rem;
  padding: 0.95rem 1.05rem;
  font-weight: 900;
}

.error {
  color: #b42318;
  background: #fee4e2;
}

.success {
  color: #05603a;
  background: #d1fadf;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  margin: 0;
}

.media-card {
  overflow: hidden;
}

.media-card img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: #e4e7ec;
}

.media-card div {
  display: grid;
  gap: 0.25rem;
  padding: 0.85rem;
}

.media-card strong {
  color: var(--ink);
  font-size: 0.9rem;
}

.media-card span {
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.4;
}

.table-card {
  overflow: hidden;
  contain: layout paint;
}

.table-card > table {
  background: transparent;
}

.table-card table tbody tr:last-child td {
  border-bottom: 0;
}

.table-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.05rem 1.15rem 0.35rem;
}

.table-heading h3 {
  font-size: 1.1rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

th,
td {
  padding: 1rem 1.15rem;
  border-bottom: 1px solid rgba(91, 103, 138, 0.08);
  text-align: left;
  vertical-align: middle;
}

th {
  color: #8c95aa;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

tbody tr {
  transition: background 140ms ease;
}

tbody tr:hover {
  background: rgba(22, 34, 52, 0.025);
}

.status-pill {
  display: inline-flex;
  border-radius: 999px;
  padding: 0.42rem 0.8rem;
  color: #42506d;
  font-size: 0.7rem;
  font-weight: 900;
  background: #edf1f7;
}

.status-pill.available,
.status-pill.active,
.status-pill.succeeded {
  color: #05603a;
  background: #d1fadf;
}

@media (max-width: 1120px) {
  .setup-grid,
  .media-grid,
  .channel-summary-grid,
  .ops-layout {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .form-grid,
  .two-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
  }

  .setup-grid,
  .form-grid,
  .two-columns,
  .media-grid,
  .channel-summary-grid,
  .ops-layout,
  .signal-grid,
  .compact-signal-grid {
    grid-template-columns: 1fr;
  }

  .wide-field {
    grid-column: auto;
  }

  .info-strip {
    display: grid;
  }
}
```
