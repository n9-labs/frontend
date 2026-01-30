import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { feedback, score, responseText, traceId } = body;

    console.log(`[MLFLOW API] Logging feedback: ${feedback} (score: ${score})`);

    // If we have a trace_id, score the trace directly
    // Otherwise create a standalone run (fallback)
    const tempScript = path.join(os.tmpdir(), `mlflow_feedback_${Date.now()}.py`);
    
    // Clean the response text to avoid issues
    const cleanText = responseText.substring(0, 500).replace(/'/g, "\\'").replace(/\n/g, "\\n");
    
    const pythonCode = traceId 
      ? `import mlflow
from mlflow.entities import AssessmentSource, AssessmentSourceType
import sys

try:
    mlflow.set_tracking_uri('http://localhost:5001')
    
    # Use the proper MLflow feedback API
    mlflow.log_feedback(
        trace_id='${traceId}',
        name='user_satisfaction',
        value=${feedback === 'yes' ? 'True' : 'False'},
        rationale='User indicated response was ${feedback === 'yes' ? 'helpful' : 'not helpful'}',
        source=AssessmentSource(
            source_type=AssessmentSourceType.HUMAN,
            source_id='web_ui'
        )
    )
    
    print('[OK] Feedback logged for trace: ${traceId}')
    sys.exit(0)
except Exception as e:
    print(f'[ERROR] Failed to log feedback: {e}', file=sys.stderr)
    sys.exit(1)
`
      : `import mlflow
import sys

try:
    mlflow.set_tracking_uri('http://localhost:5001')
    mlflow.set_experiment('expert-finder-agent')
    
    with mlflow.start_run(run_name='user_feedback_${feedback}'):
        mlflow.log_param('feedback_type', '${feedback}')
        mlflow.log_metric('user_satisfaction_score', ${score})
        mlflow.log_text('''${cleanText}''', 'rated_response.txt')
        mlflow.set_tag('feedback_source', 'human_in_the_loop')
        mlflow.set_tag('response_length', ${responseText.length})
    
    print('[OK] Feedback logged to MLflow')
    sys.exit(0)
except Exception as e:
    print(f'[ERROR] Failed to log feedback: {e}', file=sys.stderr)
    sys.exit(1)
`;

    try {
      // Write temp script
      fs.writeFileSync(tempScript, pythonCode);
      
      // Execute it
      const { stdout, stderr } = await execAsync(
        `cd agent && python3 ${tempScript}`,
        { timeout: 5000 }
      );
      
      console.log("[MLFLOW API] Python output:", stdout);
      if (stderr) console.warn("[MLFLOW API] Python stderr:", stderr);
      
      // Clean up temp file
      fs.unlinkSync(tempScript);
    } catch (execError) {
      console.warn("[MLFLOW API] Python execution failed:", execError);
      // Try to clean up temp file
      try {
        fs.unlinkSync(tempScript);
      } catch {}
      // Continue anyway - feedback was at least received
    }

    return NextResponse.json({ success: true, feedback, score });
  } catch (error) {
    console.error("[MLFLOW API] Error:", error);
    return NextResponse.json(
      { error: "Failed to log feedback" },
      { status: 500 }
    );
  }
}

