import {useEffect, useState} from "react"
import {
  Box,
  Button,
  ColumnLayout,
  FormField,
  Header,
  Modal,
  Select,
  SpaceBetween,
  Textarea,
} from "@cloudscape-design/components"
import {getDepartments} from "../services/patientApi.js"
import {getResponseData} from "../services/apiMessages.js"

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
  const [isTransferHelpOpen, setIsTransferHelpOpen] = useState(false)

  const availableDepartments = departments.filter((dep) => dep !== currentDepartment)
  const availableDoctors = allDoctors.filter(d => d.specialization === nextDepartment)
  const departmentOptions = availableDepartments.map((department) => ({
    label: department,
    value: department,
    description: "Available destination",
  }))
  const doctorOptions = availableDoctors.map((doc) => ({
    label: `Dr. ${doc.first_name} ${doc.last_name}`,
    value: String(doc.id),
    description: doc.specialization,
  }))
  const selectedDepartmentOption = departmentOptions.find((option) => option.value === nextDepartment) || null
  const selectedDoctorOption = doctorOptions.find((option) => option.value === String(nextDoctorId)) || null

  useEffect(() => {
    if (!isOpen) return

    const loadDepartments = async () => {
      try {
        const res = await getDepartments()
        setDepartments(getResponseData(res))
      } catch (error) {
        void error
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
      setIsTransferHelpOpen(false)
    }, 0)

    return () => window.clearTimeout(resetTimer)
  }, [currentDepartment, isOpen])

  if (!isOpen) {
    return null
  }

  const trimmedReason = reason.trim()
  const canSubmit = nextDepartment && nextDoctorId && trimmedReason.length > 0 && !isSubmitting

  const handleSubmit = () => {
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
    <Modal
      visible={isOpen}
      onDismiss={isSubmitting ? undefined : onClose}
      size="large"
      header={
        <Header
          variant="h2"
          description="Reassign the patient to another department and responsible doctor."
        >
          <span className="medstream-transfer-title">
            <span>Transfer Patient</span>
            <span className="medstream-transfer-help-anchor">
              <button
                type="button"
                className={`medstream-transfer-help-trigger${isTransferHelpOpen ? " medstream-transfer-help-trigger-open" : ""}`}
                aria-expanded={isTransferHelpOpen}
                aria-label={isTransferHelpOpen ? "Close transfer help" : "Open transfer help"}
                onClick={() => setIsTransferHelpOpen((isOpen) => !isOpen)}
              />
              {isTransferHelpOpen ? (
                <span className="medstream-transfer-help-card" role="dialog" aria-label="Before you confirm">
                  <button
                    type="button"
                    className="medstream-transfer-help-close"
                    aria-label="Close transfer help"
                    onClick={() => setIsTransferHelpOpen(false)}
                  />
                  <span className="medstream-transfer-help-title">Before you confirm</span>
                  <span className="medstream-transfer-help-body">
                    After confirmation, the patient is moved to the selected department and assigned to the selected doctor.
                  </span>
                  <span className="medstream-transfer-help-body">
                    Doctors from the previous department can be removed from this patient so responsibility follows the new department.
                  </span>
                  <span className="medstream-transfer-help-footer">
                    The transfer reason is required before confirming.
                  </span>
                </span>
              ) : null}
            </span>
          </span>
        </Header>
      }
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button className="medstream-cancel-button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="medstream-submit-button"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {isSubmitting ? "Transferring..." : "Confirm Transfer"}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <ColumnLayout columns={2} variant="text-grid">
          <SpaceBetween size="xxs">
            <Box color="text-body-secondary" variant="awsui-key-label">Current Department</Box>
            <Box variant="h3">{currentDepartment || "--"}</Box>
          </SpaceBetween>
          <SpaceBetween size="xxs">
            <Box color="text-body-secondary" variant="awsui-key-label">Transfer Target</Box>
            <Box variant="h3" color={nextDepartment ? "text-status-info" : "text-body-secondary"}>
              {nextDepartment || "Select department"}
            </Box>
          </SpaceBetween>
        </ColumnLayout>

        <div className="medstream-form-grid">
          <FormField label="New Department">
            <Select
              selectedOption={selectedDepartmentOption}
              onChange={({detail}) => {
                setNextDepartment(detail.selectedOption.value)
                setNextDoctorId("")
              }}
              options={departmentOptions}
              placeholder="Select department"
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Assign Doctor">
            <Select
              selectedOption={selectedDoctorOption}
              onChange={({detail}) => setNextDoctorId(detail.selectedOption.value)}
              options={doctorOptions}
              placeholder={nextDepartment ? "Select a doctor" : "Select a department first"}
              disabled={isSubmitting || !nextDepartment}
            />
          </FormField>
          <div className="medstream-form-field-wide">
            <FormField
              label="Transfer Reason"
              description="Document why the patient is being reassigned before confirming the transfer."
              stretch
            >
              <Textarea
                value={reason}
                onChange={({detail}) => setReason(detail.value)}
                placeholder="Enter the operational reason for this transfer."
                rows={3}
                disabled={isSubmitting}
              />
            </FormField>
          </div>
        </div>

      </SpaceBetween>
    </Modal>
  )
}
