import api from './axios'

export const getMembers = (params) => api.get('/members/', { params })
export const getMember = (id) => api.get(`/members/${id}/`)
export const createMember = (data) => api.post('/members/', data)
export const updateMember = (id, data) => api.put(`/members/${id}/`, data)
export const patchMember = (id, data) => api.patch(`/members/${id}/`, data)
export const deleteMember = (id, params) => api.delete(`/members/${id}/`, { params })
export const getMemberSummary = (id) => api.get(`/members/${id}/summary/`)
export const getMemberActivities = (id, params) => api.get(`/members/${id}/activities/`, { params })
export const uploadMemberPhoto = (id, formData) =>
  api.post(`/members/${id}/photo/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// Nominees
export const getNominees = (memberId) => api.get(`/members/${memberId}/nominees/`)
export const createNominee = (memberId, data) => api.post(`/members/${memberId}/nominees/`, data)
export const updateNominee = (memberId, nomineeId, data) =>
  api.put(`/members/${memberId}/nominees/${nomineeId}/`, data)
export const deleteNominee = (memberId, nomineeId) =>
  api.delete(`/members/${memberId}/nominees/${nomineeId}/`)

// Member financial views
export const getMemberChits = (id) => api.get(`/members/${id}/chits/`)
export const getMemberLoans = (id) => api.get(`/members/${id}/loans/`)
export const getMemberDues = (id, params) => api.get(`/members/${id}/dues/`, { params })
export const getMemberDeposits = (id) => api.get(`/members/${id}/deposits/`)
export const getMemberCurries = (id) => api.get(`/members/${id}/curries/`)
export const getMemberGuarantorLoans = (id) => api.get(`/members/${id}/guarantor-loans/`)
export const getMemberGuarantorWelfare = (id) => api.get(`/members/${id}/guarantor-welfare/`)
export const getMemberMasavari = (id) => api.get(`/members/${id}/masavari/`)
export const getMemberAllowances = (id) => api.get(`/members/${id}/allowances/`)
export const createMemberAllowance = (id, data) => api.post(`/members/${id}/allowances/`, data)
export const clearMemberDues = (id, data) => api.post(`/members/${id}/clear-dues/`, data)
export const clearMemberMasavari = (id, data) => api.post(`/members/${id}/clear-masavari/`, data)
