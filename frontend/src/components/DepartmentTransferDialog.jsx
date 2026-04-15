import {useEffect, useState} from "react"
import {getResponseData} from "../services/apiMessages.js";

export default function DepartmentTransferDialog({
                                                   currentDepartment,
                                                   isOpen,
                                                   isSubmitting,
                                                   onClose,
                                                   onSubmit,
                                                 }) {
  const [nextDepartment, setNextDepartment] = useState(currentDepartment || "")
  const [reason, setReason] = useState("")
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    if (!isOpen) return

    const loadDepartments = async () => {
      try {
        const res = await api.get("/departments")
        setDepartments(getResponseData(res))
      } catch {
      }
    }

    loadDepartments()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const resetTimer = window.setTimeout(() => {
      setNextDepartment(currentDepartment || "")
      setReason("")
    }, 0)

    return () => window.clearTimeout(resetTimer)
  }, [currentDepartment, isOpen])

  if (!isOpen) {
    return null
  }

  const trimmedReason = reason.trim()
  const canSubmit = nextDepartment && nextDepartment !== currentDepartment && trimmedReason.length > 0 && !isSubmitting

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    onSubmit({
      department: nextDepartment,
      reason: trimmedReason,
    })
  }

  return (
    <div className="console-modal-overlay">
      <div className="console-modal monitor-card rounded-[28px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Department Transfer</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Transfer Patient</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="console-button-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">Current Department</p>
            <p className="mt-2 text-lg font-semibold text-white">{currentDepartment || "--"}</p>
          </div>
          <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">Transfer Target</p>
            <p className="mt-2 text-lg font-semibold text-[#9dccff]">{nextDepartment || "Select department"}</p>
          </div>
        </div>

        <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">Select New Department</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {departments.map((department) => {
                const isCurrent = department === currentDepartment
                const isSelected = !isCurrent && department === nextDepartment

                return (
                  <button
                    key={department}
                    type="button"
                    onClick={() => {
                      if (isCurrent || isSubmitting) {
                        return
                      }

                      setNextDepartment(department)
                    }}
                    disabled={isCurrent || isSubmitting}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      isCurrent
                        ? "cursor-not-allowed border-[#31363f] bg-[#10151c] text-[#6b7280] opacity-70"
                        : isSelected
                          ? "border-[#ff9900] bg-[#1b2430]"
                          : "border-[#3b424b] bg-[#151b22] hover:border-[#4d5661]"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${isCurrent ? "text-[#879196]" : "text-white"}`}>{department}</p>
                    <p className={`mt-1 text-sm ${isCurrent ? "text-[#6b7280]" : "text-[#b6bec9]"}`}>
                      {isCurrent ? "Current assignment" : "Available transfer destination"}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]" htmlFor="transfer-reason">
              Transfer Reason
            </label>
            <textarea
              id="transfer-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Enter the operational reason for this transfer."
              rows={4}
              className="console-input mt-3 w-full rounded-2xl px-4 py-3 outline-none"
              disabled={isSubmitting}
              required
            />
            <p className="mt-2 text-xs text-[#879196]">Document why the patient is being reassigned before confirming the transfer.</p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="console-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="console-button-primary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
            >
              {isSubmitting ? "Transferring..." : "Confirm Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
