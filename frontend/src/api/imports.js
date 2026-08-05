import api from './axios'

export const importMembers = (formData) =>
  api.post('/import/members/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

export const previewImport = (formData) =>
  api.post('/import/members/?preview=true', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

export const downloadMemberTemplate = () =>
  api.get('/import/template/members/', { responseType: 'blob' })

export const exportMembers = (params) =>
  api.get('/export/members/', { params, responseType: 'blob' })

export const exportSingleMember = (id) =>
  api.get(`/export/member/${id}/`, { responseType: 'blob' })

export const exportOverdue = (params) =>
  api.get('/export/overdue/', { params, responseType: 'blob' })

export const exportPeriodReport = (params) =>
  api.get('/export/report/', { params, responseType: 'blob' })

export const exportWelfareReport = (params) =>
  api.get('/export/welfare-report/', { params, responseType: 'blob' })

export const exportLoanReport = (params) =>
  api.get('/export/loan-report/', { params, responseType: 'blob' })

export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(new Blob([blob]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
