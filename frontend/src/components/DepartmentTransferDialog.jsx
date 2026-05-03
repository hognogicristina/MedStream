import {useEffect, useState} from "react"
import {getDepartments} from "../services/patientApi.js"
import {getResponseData} from "../services/apiMessages.js";

export default function DepartmentTransferDialog({
                                                   currentDepartment,
                                                   isOpen,
                                                   isSubmitting,
                                                   onClose,
                                                   onSubmit,
                                                   allDoctors = [],
                                                 }) {
  const [nextDepartment, setNextDepartment] = useState("")
  const [nextDoctorId, setNextDoctorId] = useState("")
  const [reason, setReason] = useState("")
  const [departments, setDepartments] = useState([])
  const [currentPage, setCurrentPage] = useState(1)

  const availableDepartments = departments.filter((dep) => dep !== currentDepartment)
  const itemsPerPage = 4
  const maxPage = Math.max(1, Math.ceil(availableDepartments.length / itemsPerPage))
  const currentDepartments = availableDepartments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const availableDoctors = allDoctors.filter(d => d.specialization === nextDepartment)

  useEffect(() => {
    if (!isOpen) return

    const loadDepartments = async () => {
      try {
        const res = await getDepartments()
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
      setNextDepartment("")
      setNextDoctorId("")
      setReason("")
    }, 0)

    return () => window.clearTimeout(resetTimer)
  }, [currentDepartment, isOpen])

  if (!isOpen) {
    return null
  }

  const trimmedReason = reason.trim()
  const canSubmit = nextDepartment && nextDoctorId && trimmedReason.length > 0 && !isSubmitting

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    onSubmit({
      department: nextDepartment,
      doctorId: nextDoctorId,
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
              {currentDepartments.map((department) => {
                const isSelected = department === nextDepartment

                return (
                  <button
                    key={department}
                    type="button"
                    onClick={() => {
                      if (isSubmitting) {
                        return
                      }

                      setNextDepartment(department)
                      setNextDoctorId("")
                    }}
                    disabled={isSubmitting}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      isSelected
                        ? "border-[#ff9900] bg-[#1b2430]"
                        : "border-[#3b424b] bg-[#151b22] hover:border-[#4d5661]"
                    }`}
                  >
                    <p className={`text-sm font-semibold text-white`}>{department}</p>
                    <p className={`mt-1 text-sm text-[#b6bec9]`}>
                      Available destination
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]" htmlFor="doctor-select">
              Assign Doctor
            </label>
            <select
              id="doctor-select"
              value={nextDoctorId}
              onChange={(e) => setNextDoctorId(e.target.value)}
              disabled={isSubmitting || !nextDepartment}
              className="console-input mt-3 w-full rounded-2xl px-4 py-3 outline-none"
            >
              <option value="" disabled>
                {nextDepartment ? "Select a doctor" : "Select a department first"}
              </option>
              {availableDoctors.map(doc => (
                <option key={doc.id} value={doc.id}>
                  Dr. {doc.first_name} {doc.last_name}
                </option>
              ))}
            </select>
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
              rows={2}
              className="console-input mt-3 w-full rounded-2xl px-4 py-3 outline-none"
              disabled={isSubmitting}
              required
            />
            <p className="mt-2 text-xs text-[#879196]">Document why the patient is being reassigned before confirming the transfer.</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              {availableDepartments.length > itemsPerPage && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-[#879196]">Page {currentPage} of {maxPage}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || isSubmitting}
                      className="console-pagination-button"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(maxPage, p + 1))}
                      disabled={currentPage === maxPage || isSubmitting}
                      className="console-pagination-button"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className="console-button-primary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
              >
                {isSubmitting ? "Transferring..." : "Confirm Transfer"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
