import api from './axios'

export const getLoans = (params) => api.get('/loans/', { params })
export const getLoan = (id) => api.get(`/loans/${id}/`)
export const createLoan = (data) => api.post('/loans/', data)
export const updateLoan = (id, data) => api.put(`/loans/${id}/`, data)
export const approveLoan = (id, data) => api.patch(`/loans/${id}/approve/`, data)
export const closeLoan = (id, data) => api.patch(`/loans/${id}/close/`, data)

export const getRepayments = (loanId) => api.get(`/loans/${loanId}/repayments/`)
export const recordRepayment = (loanId, data) => api.post(`/loans/${loanId}/repayments/`, data)
export const updateRepayment = (rid, data) => api.put(`/repayments/${rid}/`, data)

export const getOverdueLoans = () => api.get('/loans/overdue/')
export const deleteLoan = (id) => api.delete(`/loans/${id}/`)
export const bulkRepayment = (id, data) => api.post(`/loans/${id}/bulk-repayment/`, data)
