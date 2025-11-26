import { useEffect, useRef, useState } from "react";
import styles from "./TableLoader.module.css";

export default function CellItem({
    id,
    cellValue,
    onValueChange,
    onPaste,
    selected,
    isEditing,
    onSelect,
    onRequestEdit,
    onCancelEdit,
}: CellItemProps) {
  const tdRef = useRef<HTMLTableCellElement | null>(null);
  const editValue = useRef(cellValue ?? "");

  useEffect(() => {
    // keep internal copy in sync
    editValue.current = cellValue ?? "";
  }, [cellValue]);

  useEffect(() => {
    if (isEditing && tdRef.current) {
      tdRef.current.focus();
      // place caret at end for contentEditable
      const range = document.createRange();
      range.selectNodeContents(tdRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [isEditing]);

  function handleClick(ev: React.MouseEvent) {
    ev.stopPropagation();
    onSelect(id);
  }

  function handleDoubleClick(ev: React.MouseEvent) {
    ev.stopPropagation();
    onRequestEdit(id);
  }

  function handleInput(ev: React.FormEvent<HTMLElement>) {
    editValue.current = ev.currentTarget.textContent ?? "";
  }

  function handleBlur() {
    if (isEditing) {
      onValueChange(editValue.current);
      onCancelEdit();
    }
  }

  function handlePaste(ev: React.ClipboardEvent) {
    if (!isEditing) {
      ev.preventDefault();
      const txt = ev.clipboardData.getData("text/plain");
      onPaste(txt);
    }
    // if editing, allow default paste into contentEditable
  }

  return (
    <td
      ref={tdRef}
      tabIndex={0}
      contentEditable={isEditing}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onInput={handleInput}
      onBlur={handleBlur}
      onPaste={handlePaste}
      className={selected ? styles.selectedCell : undefined}
      suppressContentEditableWarning={true}
    >
      {isEditing ? editValue.current : cellValue}
    </td>
  );
}
export interface CellItemProps {
  id: string;
  cellValue: string;
  onValueChange: (newValue: string) => void;
  onPaste: (pasteValue: string) => void;
  selected: boolean;
  isEditing: boolean;
  onSelect: (id: string) => void;
  onRequestEdit: (id: string) => void;
  onCancelEdit: () => void;
}
export interface CellData { row: number, column: number, value: string }