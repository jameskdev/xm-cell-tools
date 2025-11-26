import { useEffect, useRef } from "react";
import styles from "./TableLoader.module.css";

export default function CellItem({
    id,
    cellValue,
    onCommit,            // commit current editing buffer (parent)
    onUpdateBuffer,      // update central buffer while typing (parent)
    onPaste,
    selected,
    isEditing,
    editingBuffer,       // current buffer from parent (null when not editing)
    onSelect,
    onRequestEdit,
    onCancelRequest,     // request parent to stop editing
    onBlurNotify,        // notify parent that this cell lost focus (blur)
}: CellItemProps) {
  const tdRef = useRef<HTMLTableCellElement | null>(null);

  // When entering edit mode we must set the DOM content and place caret at end.
  useEffect(() => {
    const el = tdRef.current;
    if (isEditing && el) {
      // initialize DOM with central buffer (parent-managed).
      el.textContent = editingBuffer ?? "";
    } else if (!isEditing && el) {
      // When isEditing flips from true to false,
      // we must ensure that the correct value is shown instead of the stale one.
      el.textContent = cellValue ?? "";
    }
    // run when Edit mode flips.
  }, [isEditing]);

  function handleClick(ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!isEditing) {
      onSelect(id);
    }
  }

  function handleDoubleClick(ev: React.MouseEvent) {
    ev.stopPropagation();
    onRequestEdit();
  }

  function handleInput(ev: React.FormEvent<HTMLElement>) {
    // update central buffer in parent
    onUpdateBuffer(ev.currentTarget.textContent ?? "");
  }

  function handleBlur() {
    // notify parent that this cell lost focus; parent decides commit/cancel centrally
    onBlurNotify(id);
  }

  function handlePaste(ev: React.ClipboardEvent) {
    if (!isEditing) {
      ev.preventDefault();
      const txt = ev.clipboardData.getData("text/plain");
      onPaste(txt);
    }
    // if editing, allow default paste into contentEditable (and onInput will update buffer)
  }

  // keyboard handling for Enter (save), Escape (cancel) and arrow navigation
  function handleKeyDown(ev: React.KeyboardEvent<HTMLElement>) {
    if (isEditing) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        // commit via parent
        onCommit();
        return;
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        // tell parent to cancel; parent will clear buffer and mark cancelled
        onCancelRequest();
        return;
      }
      // while editing, allow caret movement
      return;
    }

    // NOT editing: support arrow navigation and Enter -> start edit
    /* 
    const parts = id.split("_");
    if (parts.length === 2) {
      const r = parseInt(parts[0], 10);
      const c = parseInt(parts[1], 10);
      let newR = r;
      let newC = c;
      let moved = false;
      if (ev.key === "ArrowUp") { newR = Math.max(0, r - 1); moved = newR !== r; }
      else if (ev.key === "ArrowDown") { newR = r + 1; moved = true; }
      else if (ev.key === "ArrowLeft") { newC = Math.max(0, c - 1); moved = newC !== c; }
      else if (ev.key === "ArrowRight") { newC = c + 1; moved = true; }
      else if (ev.key === "Enter") {
        ev.preventDefault();
        onRequestEdit();
        return;
      }

      if (moved) {
        ev.preventDefault();
        const newId = `${newR}_${newC}`;
        onSelect(newId);
        const el = document.getElementById("cell_" + newId) as HTMLElement | null;
        if (el) el.focus();
      }
    }
    */
  }

  return (
    <td
      id={"cell_" + id}
      ref={tdRef}
      tabIndex={0}
      contentEditable={isEditing}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onInput={handleInput}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      className={selected ? styles.selectedCell : undefined}
      suppressContentEditableWarning={true}
    >
      {/* When editing we manage DOM content directly via ref to avoid React re-render interfering with caret.
          When not editing, render authoritative cellValue so table content is normal React-rendered text. */}
      {isEditing ? null : cellValue}
    </td>
  );
}

export interface CellItemProps {
  id: string;
  cellValue: string;
  onCommit: () => void;               // commit edit to parent
  onUpdateBuffer: (txt: string) => void; // update parent's editing buffer
  onPaste: (pasteValue: string) => void;
  selected: boolean;
  isEditing: boolean;
  editingBuffer: string | null;
  onSelect: (id: string) => void;
  onRequestEdit: () => void;
  onCancelRequest: () => void;
  onBlurNotify: (id: string) => void;
}
export interface CellData { row: number, column: number, value: string }