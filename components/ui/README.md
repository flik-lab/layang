# UI primitives

This folder is reserved for shadcn/ui-style primitives. The current workbench uses `components/shadcn/compat.tsx` as a transitional layer so the large workbench can move off Material UI without a risky one-shot rewrite.

New reusable UI should be added here first, then imported by feature components as the workbench is split into smaller files.
