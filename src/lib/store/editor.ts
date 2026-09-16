import { create } from "zustand"

// Shared selection between the Catalogue panel and the PlanEditor so clicking a
// row highlights the object on the plan and vice-versa. Module-level singleton,
// so it survives the editor remounting after a revalidate.
type EditorState = {
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  // Selected association (edge). Mirrors selectedId but for the graph's edges, so
  // clicking an association in the Catalogue highlights it on the Graph and back.
  selectedEdgeId: string | null
  setSelectedEdgeId: (id: string | null) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id, selectedEdgeId: null }),
  selectedEdgeId: null,
  setSelectedEdgeId: (id) => set({ selectedEdgeId: id, selectedId: null }),
}))
