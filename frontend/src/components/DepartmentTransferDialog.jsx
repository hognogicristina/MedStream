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
  StatusIndicator,
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
          actions={<StatusIndicator type={nextDepartment ? "in-progress" : "pending"}>{nextDepartment ? "Target selected" : "Awaiting target"}</StatusIndicator>}
        >
          Transfer Patient
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
