mod commands;
mod powershell;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // App behavior
            commands::autostart::is_launch_at_startup_enabled,
            commands::autostart::enable_launch_at_startup,
            commands::autostart::disable_launch_at_startup,
            // Connection
            commands::connection::test_connection,
            commands::connection::get_dashboard_stats,
            commands::connection::get_computer_os_breakdown,
            // Users
            commands::users::get_users,
            commands::users::get_user_detail,
            commands::users::reset_user_password,
            commands::users::unlock_user,
            commands::users::toggle_user,
            commands::users::create_user,
            commands::users::update_user,
            commands::users::move_user,
            // Computers
            commands::computers::get_computers,
            commands::computers::get_computer_detail,
            commands::computers::toggle_computer,
            commands::computers::move_computer,
            // Groups
            commands::groups::get_groups,
            commands::groups::get_group_members,
            commands::groups::add_group_member,
            commands::groups::remove_group_member,
            commands::groups::create_group,
            // Reports
            commands::reports::run_report,
            // Directory (OU tree)
            commands::directory::get_ou_tree,
            commands::directory::get_ou_contents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Fuzzy Forest");
}
