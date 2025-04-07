# Resume Builder

A powerful AI-assisted tool for generating tailored resumes and cover letters from a master resume. The tool helps you create job-specific application materials while ensuring content accuracy and preventing AI hallucinations.

## Features

- **AI-Powered Resume Tailoring**: Generate job-specific resumes that highlight relevant experience and skills
- **Cover Letter Generation**: Create personalized cover letters that align with job requirements
- **Content Validation**: Built-in validation to prevent AI hallucinations and ensure factual accuracy
- **PDF Conversion**: Convert generated resumes to professional PDF format
- **Smart File Organization**: Automatically organizes output files with consistent naming conventions
- **Job Summary Generation**: Creates a structured summary of job postings to help with application targeting

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- An AI API key (e.g., OpenAI API key)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/resume-builder.git
cd resume-builder
```

2. Install dependencies:
```bash
npm install
```

3. Create a `config.json` file:
```bash
cp config.example.json config.json
```

4. Edit `config.json` with your API credentials:
```json
{
  "aiApiKey": "your-api-key-here",
  "aiApiUrl": "your-api-url-here",
  "aiModel": "your-model-name-here",
  "maxTokens": 4000
}
```

## Usage

### Basic Usage

1. Prepare your master resume in Markdown format and save it as `master-resume.md`
2. Run the tool:
```bash
node builder.js
```
3. Follow the prompts to:
   - Enter the job description
   - Review and confirm generated content
   - Save the output files

### Command Line Options

- `--role` or `-r`: Specify the job role/title directly
- `--cover` or `-c`: Generate a cover letter along with the resume
- `--hallucinate`: Test mode - intentionally introduce a hallucination in the cover letter

Example:
```bash
node builder.js --role "Senior Software Engineer" --cover
```

### File Conversion

To convert a Markdown file to PDF:
```bash
node convert.js input.md output.pdf
```

## Output Structure

The tool creates an organized output structure:
```
output/
  ├── [job-specific-folder]/
  │   ├── job-summary-[date].txt
  │   ├── resume-[name]-[role]-[company].md
  │   ├── resume-[name]-[role]-[company].pdf
  │   └── cover-letter-[name]-[role]-[company].txt
```

## How It Works

1. **Input Processing**: The tool reads your master resume and job description
2. **Content Generation**: AI generates tailored content based on the job requirements
3. **Validation**: Generated content is validated against the master resume to prevent hallucinations
4. **File Generation**: Validated content is saved in appropriate formats
5. **PDF Conversion**: Markdown resumes are converted to professional PDFs

## Security

- API keys and sensitive information are stored in `config.json`
- The master resume should be kept secure as it contains personal information
- Generated files are stored in the `output` directory

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 