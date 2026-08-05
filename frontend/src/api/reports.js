import api from './axios'

export const getDashboard = () => api.get('/reports/dashboard/')
export const getMembersSummary = () => api.get('/reports/members-summary/')
export const getChitsSummary = () => api.get('/reports/chits-summary/')
export const getLoansSummary = () => api.get('/reports/loans-summary/')
export const getDuesSummary = () => api.get('/reports/dues-summary/')
export const getOverdueList = (params) => api.get('/reports/overdue-list/', { params })
export const getPeriodReport = (params) => api.get('/reports/period/', { params })
export const getWelfarePaymentsReport = (params) => api.get('/reports/welfare-payments/', { params })
export const getLoanRepaymentsReport = (params) => api.get('/reports/loan-repayments/', { params })
