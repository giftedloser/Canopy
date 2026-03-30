use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdCredentials {
    pub domain: String,
    pub username: String,
    pub password: String,
    pub server: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionInfo {
    pub domain_name: String,
    pub forest: String,
    pub domain_controller: String,
    pub connected_as: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_users: u64,
    pub enabled_users: u64,
    pub disabled_users: u64,
    pub locked_users: u64,
    pub total_computers: u64,
    pub total_groups: u64,
}
