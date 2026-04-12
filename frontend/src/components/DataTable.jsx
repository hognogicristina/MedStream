import {useCallback, useEffect, useState} from "react"

export default function DataTable({
                                    items,
                                    loading = false,
                                    loadingMessage = "Loading data...",
                                    emptyMessage = "No records found.",
                                    pageSize = 10,
                                    sortOptions = [],
                                    defaultSort,
                                    filters = [],
                                    getItemKey,
                                    renderHeader,
                                    renderRow,
                                    rowClassName,
                                    bodyClassName = "divide-y divide-[#3b424b]",
                                    shellClassName = "overflow-hidden rounded-[24px] border border-[#3b424b] bg-[#151b22]",
                                    controlsLayoutClassName,
                                  }) {
  const pageSizeOptions = [5, 10, 15, 25]
  const buildInitialFilterValues = useCallback(() =>
    Object.fromEntries(
      filters.map((filter) => [filter.id, filter.defaultValue ?? (filter.type === "text" ? "" : "all")]),
    ), [filters])
  const filterSignature = filters.map((filter) => filter.id).join("|")
  const [currentPage, setCurrentPage] = useState(1)
  const [sortOrder, setSortOrder] = useState(defaultSort ?? sortOptions[0]?.value ?? "")
  const [filterValues, setFilterValues] = useState(() => buildInitialFilterValues())
  const [activePageSize, setActivePageSize] = useState(pageSize)

  useEffect(() => {
    const nextDefaults = buildInitialFilterValues()

    setFilterValues((current) => {
      const nextValues = {...nextDefaults, ...current}
      const isSame = Object.keys(nextValues).every((key) => nextValues[key] === current[key])
      return isSame ? current : nextValues
    })
  }, [buildInitialFilterValues, filterSignature])

  useEffect(() => {
    if (!sortOptions.some((option) => option.value === sortOrder)) {
      setSortOrder(defaultSort ?? sortOptions[0]?.value ?? "")
    }
  }, [defaultSort, sortOptions, sortOrder])

  useEffect(() => {
    setActivePageSize(pageSize)
  }, [pageSize])

  const filteredItems = items.filter((item) =>
    filters.every((filter) => filter.matches(item, filterValues[filter.id] ?? filter.defaultValue ?? "")),
  )

  const activeSort = sortOptions.find((option) => option.value === sortOrder)
  const sortedItems = activeSort ? [...filteredItems].sort(activeSort.compare) : filteredItems
  const maxPage = Math.max(1, Math.ceil(sortedItems.length / activePageSize))
  const paginatedItems = sortedItems.slice((currentPage - 1) * activePageSize, currentPage * activePageSize)
  const pageNumbers = (() => {
    if (maxPage <= 7) {
      return Array.from({length: maxPage}, (_, index) => index + 1)
    }

    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, "...", maxPage]
    }

    if (currentPage >= maxPage - 3) {
      return [1, "...", maxPage - 4, maxPage - 3, maxPage - 2, maxPage - 1, maxPage]
    }

    return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", maxPage]
  })()

  useEffect(() => {
    if (currentPage > maxPage) {
      setCurrentPage(maxPage)
    }
  }, [currentPage, maxPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [sortOrder, filterValues, activePageSize])

  return (
    <>
      <div className={controlsLayoutClassName ?? "mb-6 grid gap-4 rounded-[24px] border border-[#3b424b] bg-[#151b22] p-4 lg:grid-cols-4"}>
        {filters.map((filter) => (
          <div key={filter.id}>
            <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-[#879196]" htmlFor={filter.id}>
              {filter.label}
            </label>
            {filter.type === "text" ? (
              <input
                id={filter.id}
                type="text"
                value={filterValues[filter.id] ?? ""}
                onChange={(event) => {
                  setFilterValues((current) => ({...current, [filter.id]: event.target.value}))
                  filter.onChange?.(event.target.value)
                }}
                placeholder={filter.placeholder}
                disabled={filter.disabled}
                className="console-input w-full rounded-2xl px-4 py-3 outline-none disabled:cursor-not-allowed disabled:text-[#6b7280]"
              />
            ) : (
              <select
                id={filter.id}
                value={filterValues[filter.id] ?? filter.defaultValue ?? "all"}
                onChange={(event) => {
                  setFilterValues((current) => ({...current, [filter.id]: event.target.value}))
                  filter.onChange?.(event.target.value)
                }}
                disabled={filter.disabled}
                className="console-input w-full rounded-2xl px-4 py-3 outline-none disabled:cursor-not-allowed disabled:text-[#6b7280]"
              >
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}

        {sortOptions.length > 0 && (
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-[#879196]" htmlFor="dataTableSort">
              Sort Order
            </label>
            <select
              id="dataTableSort"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className="console-input w-full rounded-2xl px-4 py-3 outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-[#879196]" htmlFor="dataTablePageSize">
            Page Size
          </label>
          <select
            id="dataTablePageSize"
            value={activePageSize}
            onChange={(event) => setActivePageSize(Number(event.target.value))}
            className="console-input w-full rounded-2xl px-4 py-3 outline-none"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={shellClassName}>
        {renderHeader?.()}

        {loading && (
          <div className="px-4 py-5 text-sm text-[#b6bec9]">
            {loadingMessage}
          </div>
        )}

        {!loading && paginatedItems.length === 0 && (
          <div className="px-4 py-5 text-sm text-[#b6bec9]">
            {emptyMessage}
          </div>
        )}

        {!loading && paginatedItems.length > 0 && (
          <div className={bodyClassName}>
            {paginatedItems.map((item) => (
              <div key={getItemKey(item)} className={rowClassName?.(item)}>
                {renderRow(item)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="console-chip rounded-full px-4 py-2 text-sm font-medium">
          Page {currentPage} of {maxPage}
        </div>
        <div className="console-pagination">
          <button
            className="console-pagination-button"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            aria-label="Previous page"
          >
            <span className="console-pagination-arrow" aria-hidden="true">‹</span>
            <span className="console-pagination-label">Prev</span>
          </button>
          <div className="console-pagination-pages">
            {pageNumbers.map((pageNumber, index) => (
              pageNumber === "..." ? (
                <span key={`ellipsis-${index}`} className="console-pagination-ellipsis">
                  ...
                </span>
              ) : (
                <button
                  key={pageNumber}
                  type="button"
                  className={`console-pagination-page ${pageNumber === currentPage ? "console-pagination-page-active" : ""}`}
                  onClick={() => setCurrentPage(pageNumber)}
                  aria-current={pageNumber === currentPage ? "page" : undefined}
                >
                  {pageNumber}
                </button>
              )
            ))}
          </div>
          <button
            className="console-pagination-button"
            onClick={() => setCurrentPage((prev) => Math.min(maxPage, prev + 1))}
            disabled={currentPage >= maxPage}
            aria-label="Next page"
          >
            <span className="console-pagination-label">Next</span>
            <span className="console-pagination-arrow" aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </>
  )
}
