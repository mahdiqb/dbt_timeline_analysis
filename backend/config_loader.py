import os
import yaml
from pathlib import Path
from typing import Dict, Any

class ConfigLoader:
    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = Path(__file__).parent / config_path
        self._config = None
    
    def load_config(self) -> Dict[str, Any]:
        """Load configuration from YAML file with environment variable substitution"""
        if self._config is None:
            if not self.config_path.exists():
                raise FileNotFoundError(f"Config file not found: {self.config_path}")
            
            with open(self.config_path, 'r') as file:
                config_content = file.read()
                
            # Replace environment variables in the format ${VAR_NAME}
            config_content = self._substitute_env_vars(config_content)
            
            self._config = yaml.safe_load(config_content)
        
        return self._config
    
    def _substitute_env_vars(self, content: str) -> str:
        """Replace ${VAR_NAME} with environment variable values"""
        import re
        
        def replace_var(match):
            var_name = match.group(1)
            return os.getenv(var_name, f"${{{var_name}}}")  # Keep original if not found
        
        return re.sub(r'\$\{([^}]+)\}', replace_var, content)
    
    def get_database_config(self) -> Dict[str, str]:
        """Get database configuration"""
        config = self.load_config()
        db_config = config.get('database', {})
        
        return {
            'url': db_config.get('url', os.getenv('DATABASE_URL')),
            'schema': db_config.get('schema', 'public')
        }

# Global config loader instance
config_loader = ConfigLoader()