"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/src/lib/utils"

/**
 * Pilihan dropdown berbasis Radix (pengganti <select> bawaan browser, supaya tampilannya sama di semua
 * perangkat dan bisa dicari dengan keyboard). API dibuat setia pada <select>: anak-anaknya tetap <option>,
 * hanya `onChange` diganti `onValueChange(value)`.
 *
 *   <Select value={x} onValueChange={setX} className="field-input">
 *     <option value="">Semua</option>
 *     <option value="a">A</option>
 *   </Select>
 */

// Radix menolak Item bernilai "" (itu nilai "kosong" miliknya), sedangkan filter kita sering memakai "".
const EMPTY = "__kosong__"

interface ParsedOption {
  value: string
  label: React.ReactNode
  disabled: boolean
}

interface ParsedGroup {
  label: string
  options: ParsedOption[]
}

function parseOptions(children: React.ReactNode): {
  options: ParsedOption[]
  groups: ParsedGroup[]
  placeholder: React.ReactNode
} {
  let options: ParsedOption[] = []
  const groups: ParsedGroup[] = []
  let placeholder: React.ReactNode = null
  const walk = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return
      const props = child.props as {
        value?: string | number
        disabled?: boolean
        label?: string
        children?: React.ReactNode
      }
      if (child.type === React.Fragment) {
        walk(props.children)
        return
      }
      if (child.type === "optgroup") {
        const outer = options
        options = []
        walk(props.children)
        groups.push({ label: props.label ?? "", options })
        options = outer
        return
      }
      if (child.type !== "option") return
      const value = props.value === undefined ? String(props.children ?? "") : String(props.value)
      // <option value="" disabled>Pilih...</option> = teks petunjuk, bukan pilihan.
      if (value === "" && props.disabled) {
        placeholder = props.children
        return
      }
      options.push({ value, label: props.children, disabled: Boolean(props.disabled) })
    })
  }
  walk(children)
  return { options, groups, placeholder }
}

export interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  id?: string
  name?: string
  className?: string
  disabled?: boolean
  required?: boolean
  title?: string
  placeholder?: string
  "aria-label"?: string
  "aria-labelledby"?: string
}

function Select({
  value,
  onValueChange,
  children,
  id,
  name,
  className,
  disabled,
  required,
  title,
  placeholder,
  ...aria
}: SelectProps) {
  const { options, groups, placeholder: optionPlaceholder } = React.useMemo(() => parseOptions(children), [children])
  const hasEmpty = [...options, ...groups.flatMap((g) => g.options)].some((o) => o.value === "")
  return (
    <SelectPrimitive.Root
      value={value === "" ? (hasEmpty ? EMPTY : "") : value}
      onValueChange={(v) => onValueChange(v === EMPTY ? "" : v)}
      name={name}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger id={id} className={className} title={title} {...aria}>
        <SelectPrimitive.Value placeholder={placeholder ?? optionPlaceholder ?? "Pilih"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value === "" ? EMPTY : o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
        {groups.map((g) => (
          <SelectPrimitive.Group key={g.label}>
            <SelectPrimitive.Label className="px-2 py-1.5 text-xs font-medium text-slate-600">{g.label}</SelectPrimitive.Label>
            {g.options.map((o) => (
              <SelectItem key={o.value} value={o.value === "" ? EMPTY : o.value} disabled={o.disabled}>
                {o.label}
              </SelectItem>
            ))}
          </SelectPrimitive.Group>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  )
}

function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        // Tinggi minimal 44 px di layar sentuh (HP dan tablet), mengikuti .field-input di desktop.
        "flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 text-left [@media(pointer:coarse)]:min-h-11",
        "data-[placeholder]:text-slate-500 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-slate-500" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position="popper"
        sideOffset={4}
        collisionPadding={8}
        className={cn(
          "z-[1300] max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-[13px] text-slate-900 shadow-lg",
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md py-2 pl-8 pr-2 outline-none",
        "data-[highlighted]:bg-slate-100 data-[state=checked]:font-medium data-[disabled]:pointer-events-none data-[disabled]:text-slate-400",
        "[@media(pointer:coarse)]:py-3",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check aria-hidden className="size-4 text-brand-600" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectTrigger, SelectContent, SelectItem }
