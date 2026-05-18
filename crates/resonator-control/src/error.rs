/// Errors that can occur during desktop control operations.
#[derive(Debug)]
pub enum ControlError {
    CommandFailed(String),
    PermissionDenied(String),
    Timeout,
    NotSupported(String),
}

impl std::fmt::Display for ControlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::CommandFailed(msg) => write!(f, "Command failed: {msg}"),
            Self::PermissionDenied(msg) => write!(f, "Permission denied: {msg}"),
            Self::Timeout => write!(f, "Operation timed out"),
            Self::NotSupported(msg) => write!(f, "Not supported: {msg}"),
        }
    }
}

impl std::error::Error for ControlError {}
