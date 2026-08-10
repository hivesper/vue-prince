import type { Component } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { ResourceId, ResourceListItem, ResourceSchemaField } from './api'
import type { PrinceButtonType } from './button-props'
import type { SpecFieldType } from './resource'
import type { ResourceSort } from './sort'

export type FieldComponentEntry = Component | { form?: Component; display?: Component }
export type FieldComponentMap = Partial<Record<SpecFieldType | 'resource', FieldComponentEntry>>
export type ButtonComponentMap = Partial<Record<PrinceButtonType, Component>>

export interface LayoutCardProps {
  title?: string
}

export interface LayoutTableProps {
  items: ResourceListItem<Record<string, unknown>>[]
  schema: ResourceSchemaField[]
  labels: Record<string, string>
  resource: string
  onRowClick?: (item: ResourceListItem<Record<string, unknown>>) => void
  sort?: ResourceSort | null
  onSort?: (column: string) => void
  selection?: ResourceId[]
  onToggleSelection?: (id: ResourceId) => void
  onToggleAllSelection?: (selected: boolean) => void
  rowSelectionLabel?: (item: ResourceListItem<Record<string, unknown>>) => string
}

export interface LayoutTabsProps {
  labels: string[]
}

export interface LayoutDropdownProps {
  actions: Array<{ label: string; onClick: () => void }>
}

export type LayoutPageComponentMap = {
  list?: Component
  view?: Component
  create?: Component
  edit?: Component
  delete?: Component
}

export type LayoutComponentMap = {
  card?: Component
  table?: Component
  tabs?: Component
  dropdown?: Component
  pages?: LayoutPageComponentMap
}

export type VuePrinceConfig = {
  api: {
    baseUrl: string
    headers?: MaybeRefOrGetter<Record<string, string>>
  }
  fields?: FieldComponentMap
  buttons?: ButtonComponentMap
  layout?: LayoutComponentMap
  userPermissions?: () => string[]
}

let _config: VuePrinceConfig = {
  api: { baseUrl: '' },
}

export function configureVuePrince(config: VuePrinceConfig): void {
  _config = config
}

export function getConfig(): VuePrinceConfig {
  return _config
}
