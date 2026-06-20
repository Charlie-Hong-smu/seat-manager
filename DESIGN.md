# Figma and React Design Workflow

This project uses Figma Make as a design reference and `frontend-react/` as the real implementation source.

Do not directly overwrite the React app with Figma Make exports. Treat Figma Make code as design context: page structure, visual hierarchy, spacing, colors, card styles, table density, and component intent should be translated into the existing React architecture while preserving business logic.

## Current Source Roles

- Real app source: `frontend-react/`
- Legacy app source: root `index.html`, `style.css`, `app.js`
- AI and cloud logic: `cloudflare-worker/`
- Design workflow note: this file

## Figma References

Use these Figma Make files with different responsibilities:

- Grades page primary reference:
  `https://www.figma.com/make/1QpH5tRbV2oVGkSKN8tDph/%E4%BC%98%E5%8C%96%E6%88%90%E7%BB%A9%E9%A1%B5%E9%9D%A2%E8%AE%BE%E8%AE%A1`

- Full app visual reference:
  `https://www.figma.com/make/T89q98PawNHmuhwiEPbBHY/Redesign-Seat-Management-System`

The first file is better for the grades dashboard information architecture. The second file is better for the overall light dashboard style across seat layout, grades, and comment workbench.

## How To Read Figma Make Context

For Figma Make URLs, use the Figma design context tool with:

- `fileKey`: the key after `/make/`
- `nodeId`: `0:1`

For the grades page file, important readable resources include:

- `src/app/App.tsx`
- `src/app/components/GradesPage.tsx`
- `src/app/components/CommentWorkbench.tsx`
- `src/app/components/SeatBoard.tsx`
- `src/app/components/Sidebar.tsx`
- `src/app/components/StudentModal.tsx`
- `src/app/components/mockData.ts`
- `src/styles/theme.css`
- `src/styles/index.css`

These files are enough to reproduce the layout and visual style, but they should not replace the app directly.

## Implementation Rules

1. Keep `frontend-react/` as the single source of truth for the new app.
2. Keep the legacy root app available; do not delete `index.html`, `style.css`, or `app.js`.
3. Keep `cloudflare-worker/` independent; do not move API keys or Worker-only secrets into frontend code.
4. Preserve existing business logic when applying Figma designs:
   - seat data and seat operations
   - student management
   - grade import, saved exams, statistics, and dashboard data
   - AI comment drafts, cache, rubric, single generation, and batch generation
   - local backup, cloud backup/restore, login, and PWA behavior
5. Do not create a new shell around an old page. Rebuild the page structure inside the current React component.
6. Do not copy Figma Make mock data into production behavior except as empty-state or fallback examples.
7. Prefer adapting existing React components over importing a whole Figma Make export.

## Grades Page Target

When improving the grades page, use the `1QpH5tRbV2oVGkSKN8tDph` Figma Make file as the primary reference.

The target structure is:

- Left lightweight grades navigation:
  - choose exam
  - view subjects
  - import grades
  - secondary links for history, complete table, and comment workbench
- Right dashboard area:
  - header with title and subtitle
  - single exam / subject trend segmented switch
  - 4 metric cards
  - main chart area with subject average comparison on the left
  - grade distribution card on the right
  - student grades table below with search in the table header area

Avoid putting exam selectors, metric selectors, and complete-table controls all in one title row.

## Visual System

The React app should use a quiet dashboard style:

- light gray-white page background
- white or near-white cards
- light borders
- soft shadows
- consistent radius
- consistent button height
- clear table row height
- compact but readable typography

Avoid mixing the old glassmorphism style with the new dashboard style.

## Recommended New-Chat Prompt

When starting a new Codex conversation about this project, paste this:

```text
Project: /Users/charlie/Documents/座位管理系统

Please read README.md, frontend-react/README.md, and DESIGN.md first.

Important design workflow:
- frontend-react/ is the real React implementation source.
- Figma Make is design reference only; do not overwrite the project with Make exports.
- For grades page work, use Figma Make file 1QpH5tRbV2oVGkSKN8tDph as the primary reference.
- For overall app style, use Figma Make file T89q98PawNHmuhwiEPbBHY as secondary visual reference.
- Preserve existing business logic: seat management, grade import/save/statistics, AI comments, comment workbench, local/cloud backup, login, and PWA.
- Do not create a new shell around old pages; rebuild the current React component structure to match the design.
```

## Build Check

After UI changes, run:

```bash
cd frontend-react
npm run build
```
