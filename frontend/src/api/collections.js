import api from './axios'


export const getDailyEntries = (params) => api.get('/collections/daily/', { params })
export const createDailyEntry = (data) => api.post('/collections/daily/', data)
export const getDailySummary = (params) => api.get('/collections/summary/', { params })
export const deleteDailyEntry = (id) => api.delete(`/collections/daily/${id}/`)
