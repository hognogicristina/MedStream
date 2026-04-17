import PatientActivityDialog from "./PatientActivityDialog"

export default function DoctorActivityDialog(props) {
  return (
    <PatientActivityDialog
      {...props}
      patientSelectionMode="single"
    />
  )
}
