# Import the Flask app from the webapp folder
import sys
import os

# Add the webapp directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'webapp'))

# Import the Flask app from webapp.main
from webapp.main import app

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)