<template>
  <component :is="customComponent" v-if="customComponent" v-bind="customProps" />
  <PrinceCard v-else :title="resourceLabelPlural">
    <template v-if="canCreate || listActions.length" #header>
      <div class="vue-resource prince-list-header-actions">
        <component :is="dropdownComponent" v-if="listActions.length" :actions="listActions" />
        <PrinceButton v-if="canCreate" type="Create" @click="createNew"
          >Create {{ resourceLabel }}</PrinceButton
        >
      </div>
    </template>

    <component
      :is="searchComponent"
      v-if="searchComponent"
      :value="search"
      :on-search="scheduleSearch"
    />
    <input
      v-else
      v-model="searchInput"
      type="search"
      placeholder="Search…"
      class="vue-resource prince-search-input"
      @input="onSearchInput"
    />

    <div v-if="selection.length" class="vue-resource prince-bulk-bar">
      <span class="vue-resource prince-bulk-count">{{ selection.length }} selected</span>
      <PrinceButton
        v-for="(action, index) in bulkActions"
        :key="index"
        type="Edit"
        :disabled="runningBulkAction"
        @click="runBulkAction(action)"
        >{{ bulkActionLabel(action) }}</PrinceButton
      >
      <PrinceButton type="Cancel" :disabled="runningBulkAction" @click="selection = []"
        >Clear</PrinceButton
      >
      <span v-if="bulkError" class="vue-resource prince-error">{{ bulkError }}</span>
    </div>

    <ResourceListView
      :items="items"
      :schema="schema"
      :labels="labels"
      :fields="enrichedFields"
      :resource="route.meta.spec?.name"
      :loading="store.loading.list"
      :error="store.error"
      :last-error="store.lastError"
      :on-row-click="navigateToItem"
      :item-actions="route.meta.spec?.actions?.resource"
      :sort="sort"
      :on-sort="applySort"
      :selection="selection"
      :on-toggle-selection="bulkActions.length ? toggleSelection : undefined"
      :on-toggle-all-selection="bulkActions.length ? toggleAllOnPage : undefined"
      :row-selection-label="rowSelectionLabel"
    />

    <template #footer>
      <div v-if="store.itemsMeta" class="vue-resource prince-pagination">
        <PrinceButton type="Pagination" label="|←" :disabled="page <= 1" @click="goToPage(1)" />
        <PrinceButton
          type="Pagination"
          label="←"
          :disabled="page <= 1"
          @click="goToPage(page - 1)"
        />
        <PrinceButton
          v-for="p in pages"
          :key="p"
          type="Pagination"
          :label="String(p)"
          :variant="p === page ? 'primary' : undefined"
          @click="goToPage(p)"
        />
        <PrinceButton
          type="Pagination"
          label="→"
          :disabled="page >= store.itemsMeta.last_page"
          @click="goToPage(page + 1)"
        />
        <PrinceButton
          type="Pagination"
          label="→|"
          :disabled="page >= store.itemsMeta.last_page"
          @click="goToPage(store.itemsMeta.last_page)"
        />
      </div>
    </template>
  </PrinceCard>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createResourceController } from '../resource-controller'
import type { ResourceId, ResourceListItem, ResourceSchemaField } from '../api'
import type { ResourceListPageProps } from '../page-props'
import type { ResourceBulkAction, ResourceFieldDef } from '../resource'
import { hasPermission, hasActionPermission, isResourceRef, resolveFieldType } from '../resource'
import { formatSort, parseSort, toggleSort } from '../sort'
import { getConfig } from '../config'
import PrinceButton from '../ui/PrinceButton.vue'
import PrinceCard from '../ui/PrinceCard.vue'
import PrinceDropdown from '../ui/PrinceDropdown.vue'

import ResourceListView from '../ui/ResourceListView.vue'
import { useResourceLabels, useResourceLabelMap, useResourceSchema } from './use-resource-meta'

const route = useRoute()
const router = useRouter()
const store = createResourceController(route.meta.spec!).store()

const segment = computed(() => route.meta.spec?.route.split('/').pop())
function pluralize(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies'
  if (/(s|sh|ch|x|z)$/i.test(word)) return word + 'es'
  return word + 's'
}

const resourceLabel = computed(() => {
  const name = route.meta.spec?.name ?? ''
  return name.charAt(0).toUpperCase() + name.slice(1)
})

const resourceLabelPlural = computed(() => pluralize(resourceLabel.value))

const specFields = route.meta.spec?.fields
const hasSpecFields = specFields && Object.keys(specFields).length > 0

const schema = useResourceSchema(
  () =>
    store.itemsMeta?.schema?.length
      ? store.itemsMeta.schema
      : (store.schemaFields as ResourceSchemaField[]),
  { previewOnly: true },
)
const labels = useResourceLabels()

const page = computed(() => Number(route.query.page ?? 1))
const search = computed<Record<string, string>>(() => {
  const { page: _page, sort: _sort, ...rest } = route.query
  void _page
  void _sort

  return Object.fromEntries(
    Object.entries(rest)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, v as string]),
  )
})

// Kept as the raw query value rather than the parsed pair, so a hand-written multi-column
// `?sort=a:asc,b:desc` reaches the backend intact even though the headers toggle one column.
const sortParam = computed(() => (typeof route.query.sort === 'string' ? route.query.sort : ''))
const sort = computed(() => parseSort(sortParam.value))

const searchInput = ref(((route.query.search as string) ?? '').replace(/%/g, ''))
watch(
  () => route.query.search,
  (val) => {
    searchInput.value = ((val as string) ?? '').replace(/%/g, '')
  },
)

let searchDebounce: ReturnType<typeof setTimeout>
function scheduleSearch(params: Record<string, string>) {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    router.push({
      query: { page: '1', ...(sortParam.value ? { sort: sortParam.value } : {}), ...params },
    })
  }, 300)
}
function onSearchInput() {
  scheduleSearch(searchInput.value ? { search: `%${searchInput.value}%` } : {})
}

const pages = computed<number[]>(() => {
  const last = store.itemsMeta?.last_page ?? 1
  const p = page.value
  const start = Math.min(Math.max(1, p - 1), Math.max(1, last - 2))
  const end = Math.min(start + 2, last)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})

watch(
  [page, search, sortParam],
  ([p, s, by]) => store.list({ page: String(p), ...s, ...(by ? { sort: by } : {}) }),
  { immediate: true },
)

onMounted(() => {
  if (!hasSpecFields) store.fetchSchema()
})

function goToPage(p: number) {
  router.push({ query: { ...route.query, page: String(p) } })
}

function applySort(column: string) {
  const next = toggleSort(sort.value, column)
  const { sort: _sort, ...rest } = route.query
  void _sort

  router.push({
    query: { ...rest, page: '1', ...(next ? { sort: formatSort(next) } : {}) },
  })
}

function navigateToItem(item: ResourceListItem<Record<string, unknown>>) {
  router.push({ name: `${segment.value}-detail`, params: { id: String(item.id) } })
}

function createNew() {
  router.push({ name: `${segment.value}-create` })
}

const canCreate = computed(() => hasPermission(store.schemaPermissions, 'create'))

const dropdownComponent = computed(() => getConfig().layout?.dropdown ?? PrinceDropdown)
const listActions = computed(() =>
  (route.meta.spec?.actions?.list ?? []).filter((a) => hasActionPermission(a.permission)),
)

const selection = ref<ResourceId[]>([])
const runningBulkAction = ref(false)
const bulkError = ref<string | null>(null)

const bulkActions = computed(() =>
  (route.meta.spec?.actions?.bulk ?? []).filter((a) => hasActionPermission(a.permission)),
)

function bulkActionLabel(action: ResourceBulkAction): string {
  return typeof action.label === 'function' ? action.label(selection.value) : action.label
}

function toggleSelection(id: ResourceId) {
  selection.value = selection.value.includes(id)
    ? selection.value.filter((selected) => selected !== id)
    : [...selection.value, id]
}

// Only the ids on screen, so a selection made before paging or searching is not silently dropped.
function toggleAllOnPage(selected: boolean) {
  const onPage = items.value.map((item) => item.id)
  selection.value = selected
    ? [...selection.value.filter((id) => !onPage.includes(id)), ...onPage]
    : selection.value.filter((id) => !onPage.includes(id))
}

// Re-lists rather than patching local state: a bulk action may change what the current filter
// matches, and the page has no idea what the action did.
async function runBulkAction(action: ResourceBulkAction) {
  bulkError.value = null
  runningBulkAction.value = true
  try {
    await action.onClick([...selection.value])
    selection.value = []
    await store.list({
      page: String(page.value),
      ...search.value,
      ...(sortParam.value ? { sort: sortParam.value } : {}),
    })
  } catch (error) {
    // Caught rather than left to reject: the click handler cannot await, so a throwing action
    // would otherwise surface only as an unhandled rejection. The selection is kept so the
    // operator can retry, and the action stays free to report the failure its own way too.
    bulkError.value = error instanceof Error ? error.message : 'The action could not be completed'
  } finally {
    runningBulkAction.value = false
  }
}

const rowSelectionLabel = (item: ResourceListItem<Record<string, unknown>>): string =>
  `Select ${route.meta.spec?.title?.(item) ?? item.id}`

const customComponent = computed(
  () => route.meta.spec?.components?.list ?? getConfig().layout?.pages?.list,
)
const searchComponent = computed(() => route.meta.spec?.components?.search)

const items = computed(() => store.items as ResourceListItem<Record<string, unknown>>[])

const { labelMap } = useResourceLabelMap(
  () => items.value,
  () => route.meta.spec?.fields,
)

const enrichedFields = computed(() => {
  const specFields = route.meta.spec?.fields
  if (!specFields) return specFields
  const result: Record<string, ResourceFieldDef> = {}
  for (const [name, def] of Object.entries(specFields)) {
    if (isResourceRef(resolveFieldType(def.type)) && !def.list?.formatter) {
      const map = labelMap.value
      result[name] = {
        ...def,
        list: {
          ...def.list,
          formatter: (id) => (id != null ? (map[name]?.[String(id)] ?? String(id)) : '—'),
        },
      }
    } else {
      result[name] = def
    }
  }
  return result
})

const customProps = computed<ResourceListPageProps>(() => ({
  items: items.value,
  schema: schema.value,
  labels: labels.value,
  fields: enrichedFields.value,
  resource: route.meta.spec?.name,
  loading: store.loading.list,
  error: store.error,
  lastError: store.lastError,
  itemsMeta: store.itemsMeta,
  page: page.value,
  search: search.value,
  sort: sort.value,
  navigateToItem,
  goToPage,
  createNew,
  onSearch: scheduleSearch,
  onSort: applySort,
  canCreate: canCreate.value,
  selection: selection.value,
  onToggleSelection: toggleSelection,
  onToggleAllSelection: toggleAllOnPage,
  bulkActions: bulkActions.value,
  onRunBulkAction: runBulkAction,
}))
</script>

<style>
.vue-resource.prince-search-input {
  padding: 5px 10px;
  border: 1px solid var(--prince-color-border, #dee2e6);
  border-radius: 4px;
  font-size: var(--prince-font-size-sm, 0.8125rem);
  font-family: var(--prince-font-family, system-ui, -apple-system, sans-serif);
  color: var(--prince-color-text, #212529);
  background: var(--prince-color-bg, #fff);
  width: 100%;
  margin-bottom: 16px;
  transition:
    border-color var(--prince-transition, 150ms ease),
    box-shadow var(--prince-transition, 150ms ease);
}

.vue-resource.prince-search-input:focus {
  outline: none;
  border-color: var(--prince-color-border-focus, #4a90d9);
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.15);
}

.vue-resource.prince-pagination {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.vue-resource.prince-pagination .prince-btn {
  padding: 4px 8px;
  min-width: 2rem;
  font-size: var(--prince-font-size-sm, 0.8125rem);
}

.vue-resource.prince-list-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vue-resource.prince-bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 8px 12px;
  border: 1px solid var(--prince-color-border, #dee2e6);
  border-radius: var(--prince-radius-sm, 4px);
  background: var(--prince-color-surface, #f8f9fa);
}

.vue-resource.prince-bulk-count {
  font-family: var(--prince-font-family, system-ui, -apple-system, sans-serif);
  font-size: var(--prince-font-size-sm, 0.8125rem);
  color: var(--prince-color-text-muted, #6c757d);
  margin-right: auto;
}
</style>
